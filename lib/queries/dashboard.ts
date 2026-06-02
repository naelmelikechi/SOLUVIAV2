import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { ACTIVE_CONTRACT_STATES } from '@/lib/utils/contrat-states';
import { computeContractSchedule } from './production';
import type { Periode } from '@/lib/utils/dashboard-periode';
import { groupContratsByType } from '@/lib/utils/kpi-computations';
import { encaisseHt } from '@/lib/utils/montant-ht';
import {
  format,
  startOfMonth,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  isWeekend,
} from 'date-fns';
import { fr } from 'date-fns/locale';

const ACTIVE_STATES_ARRAY = Array.from(ACTIVE_CONTRACT_STATES);

export async function getDashboardData() {
  const supabase = await createClient();

  // 30 days ago for stale contrats detection
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = format(thirtyDaysAgo, 'yyyy-MM-dd');

  const [projetsRes, facturesRes, echeancesRes, contratsRes, staleContratsRes] =
    await Promise.all([
      supabase
        .from('projets')
        .select(
          'id, client:clients!projets_client_id_fkey!inner(is_demo, archive)',
        )
        .eq('statut', 'actif')
        .eq('archive', false)
        .eq('client.is_demo', false)
        .eq('client.archive', false),
      supabase
        .from('factures')
        .select(
          'id, statut, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      supabase
        .from('echeances')
        .select(
          'id, projet:projets!echeances_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .is('facture_id', null)
        .eq('validee', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      supabase
        .from('contrats')
        .select(
          'id, contract_type, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
      // Contrats actifs depuis +30j candidats au "sans progression".
      // On joint contrats_progressions pour avoir last_activity_at (source
      // Eduvia) en plus du fallback saisies_temps.
      supabase
        .from('contrats')
        .select(
          'id, projet_id, contrats_progressions(last_activity_at), projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
        )
        .eq('archive', false)
        .in('contract_state', ACTIVE_STATES_ARRAY)
        .lt('date_debut', thirtyDaysAgoStr)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false),
    ]);

  // Log any individual query errors but don't throw - dashboard is best-effort
  if (projetsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (projets)', {
      error: projetsRes.error,
    });
  if (facturesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (factures)', {
      error: facturesRes.error,
    });
  if (echeancesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (echeances)', {
      error: echeancesRes.error,
    });
  if (contratsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (contrats)', {
      error: contratsRes.error,
    });
  if (staleContratsRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardData failed (staleContrats)',
      { error: staleContratsRes.error },
    );

  // "Sans progression" = contrats actifs depuis +30j sans activite recente.
  // Source primaire : contrats_progressions.last_activity_at (Eduvia).
  // Fallback : saisies_temps au niveau projet quand Eduvia n'a rien renvoye.
  const staleContrats = staleContratsRes.data ?? [];
  const thirtyDaysAgoTs = thirtyDaysAgo.getTime();
  const contratsWithNoEduviaActivity: Array<{
    id: string;
    projet_id: string;
  }> = [];
  for (const c of staleContrats) {
    const prog = Array.isArray(c.contrats_progressions)
      ? c.contrats_progressions[0]
      : c.contrats_progressions;
    const lastActivity = prog?.last_activity_at;
    if (lastActivity) {
      // Eduvia a une donnee : decision directe sur ce timestamp
      const t = new Date(lastActivity).getTime();
      if (t < thirtyDaysAgoTs) {
        contratsWithNoEduviaActivity.push({ id: c.id, projet_id: c.projet_id });
      }
    } else {
      // Pas de donnee Eduvia : fallback verification saisies_temps
      contratsWithNoEduviaActivity.push({ id: c.id, projet_id: c.projet_id });
    }
  }

  let contratsSansProgression = 0;
  if (contratsWithNoEduviaActivity.length > 0) {
    const projetIdsToCheck = [
      ...new Set(contratsWithNoEduviaActivity.map((c) => c.projet_id)),
    ];
    const { data: recentSaisies } = await supabase
      .from('saisies_temps')
      .select('projet_id')
      .in('projet_id', projetIdsToCheck)
      .gte('date', thirtyDaysAgoStr);

    const projetsWithSaisieRecente = new Set(
      (recentSaisies ?? []).map((s) => s.projet_id),
    );
    contratsSansProgression = contratsWithNoEduviaActivity.filter(
      (c) => !projetsWithSaisieRecente.has(c.projet_id),
    ).length;
  }

  const activeContratsList = contratsRes.data ?? [];
  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard:
      facturesRes.data?.filter((f) => f.statut === 'en_retard').length ?? 0,
    facturesEmises:
      facturesRes.data?.filter((f) => f.statut === 'emise').length ?? 0,
    echeancesAFacturer: echeancesRes.data?.length ?? 0,
    contratsActifs: activeContratsList.length,
    contratsSansProgression,
    byType: groupContratsByType(activeContratsList),
  };
}

// capitalize helper used by the MMM yyyy label formatter further down
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Dashboard financial KPIs
// ---------------------------------------------------------------------------

export interface DashboardFinancials {
  totalProduction: number; // production OPCO theorique du mois courant (schedule 40/30/20/10) - versements OPCO non assujettis TVA, HT=TTC
  totalFacture: number; // HT - sum of factures.montant_ht (clients reels uniquement)
  totalEncaisse: number; // HT - paiements TTC ramenes au prorata HT/TTC de chaque facture
  totalEnRetard: number; // HT - sum factures.montant_ht en retard moins encaisse HT partiel recu
  totalAFacturer: number; // HT - sum montant_prevu_ht des echeances pretes a emettre
  nbApprenantsActifs: number; // count of active contrats
  nbFormationsEnCours: number; // count distinct formations sur contrats actifs
  nbAbandons: number; // count contrats resilie ou ANNULE (synced)
  pedagogieAvgPct: number; // avg progression_percentage des contrats actifs (0-100)
  nbApprenantsRqth: number; // apprenants RQTH actifs (disabled_worker=true)
  rqthPct: number; // % RQTH parmi apprenants actifs (Qualiopi indicateur 14)
  tempsNonSaisi: number; // days without time entries this week
  tauxSaisieTemps: number; // % of time entries filled this month
}

export async function getDashboardFinancials(
  periode?: Periode,
): Promise<DashboardFinancials> {
  const supabase = await createClient();

  // Run all queries in parallel
  // Compute week boundaries for time tracking
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayStr = format(monday, 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  // Month boundaries for taux saisie temps
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const monthKey = periode
    ? periode.from.toISOString().slice(0, 7)
    : format(now, 'yyyy-MM');

  // Build factures query (filtered by date_emission when periode provided)
  let facturesQuery = supabase
    .from('factures')
    .select(
      'montant_ht, statut, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
    )
    .in('statut', ['emise', 'payee', 'en_retard', 'avoir'])
    .eq('projet.client.is_demo', false)
    .eq('projet.client.archive', false);

  if (periode) {
    facturesQuery = facturesQuery
      .gte('date_emission', periode.from.toISOString().slice(0, 10))
      .lte('date_emission', periode.to.toISOString().slice(0, 10));
  }

  // Build paiements query (filtered by date_reception when periode provided)
  let paiementsQuery = supabase
    .from('paiements')
    .select(
      'montant, facture:factures!paiements_facture_id_fkey!inner(montant_ht, montant_ttc, projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive)))',
    )
    .eq('facture.projet.client.is_demo', false)
    .eq('facture.projet.client.archive', false);

  if (periode) {
    paiementsQuery = paiementsQuery
      .gte('date_reception', periode.from.toISOString().slice(0, 10))
      .lte('date_reception', periode.to.toISOString().slice(0, 10));
  }

  const [
    facturesRes,
    paiementsRes,
    facturesRetardRes,
    contratsProdRes,
    contratsRes,
    tempsRes,
    tempsMonthRes,
    usersRes,
    feriesRes,
    echeancesAFacturerRes,
    operationalRes,
  ] = await Promise.all([
    // Factures pour totalFacture (exclut clients demo/archives) - filtre periode optionnel
    facturesQuery,
    // Paiements pour totalEncaisse (exclut clients demo/archives via facture) - filtre periode optionnel
    paiementsQuery,
    // Factures en retard avec leurs paiements pour calculer le vrai net non encaisse
    // Note: pas de filtre date - cumul a date, encours non-periodise
    supabase
      .from('factures')
      .select(
        'id, montant_ht, montant_ttc, paiements(montant), projet:projets!factures_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
      )
      .eq('statut', 'en_retard')
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false),
    // Contrats pour calcul Production OPCO du mois (schedule 40/30/20/10)
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, npec_amount, projet:projets!contrats_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
      )
      .eq('archive', false)
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false),
    // Distinct learners (eduvia_employee_id) actually in formation. We dedup
    // in JS rather than via SQL DISTINCT - works consistently across the
    // mix of internal `actif` and Eduvia-driven states.
    supabase
      .from('contrats')
      .select('eduvia_employee_id')
      .eq('archive', false)
      .in('contract_state', ACTIVE_STATES_ARRAY),
    supabase
      .from('saisies_temps')
      .select('date')
      .gte('date', mondayStr)
      .lte('date', todayStr),
    // Monthly time entries for taux saisie
    supabase
      .from('saisies_temps')
      .select('user_id, date')
      .gte('date', monthStart)
      .lte('date', monthEnd),
    // Active users (admin + cdp)
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('actif', true)
      .in('role', ['admin', 'cdp']),
    // Public holidays for current month
    supabase
      .from('jours_feries')
      .select('date')
      .gte('date', monthStart)
      .lte('date', monthEnd),
    // Echeances pretes a emettre pour totalAFacturer (cumul a date, non periodise)
    supabase
      .from('echeances')
      .select(
        'montant_prevu_ht, projet:projets!echeances_projet_id_fkey!inner(client:clients!projets_client_id_fkey!inner(is_demo, archive))',
      )
      .is('facture_id', null)
      .eq('validee', false)
      .lte('date_emission_prevue', format(now, 'yyyy-MM-dd'))
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false),
    // Separate query : KPIs operationnels (formations, abandons, pedagogie).
    // On charge tous les contrats Eduvia non archives une fois et on derive.
    // join apprenants pour le KPI Qualiopi handicap (RQTH).
    supabase
      .from('contrats')
      .select(
        'eduvia_formation_id, contract_state, eduvia_employee_id, source_client_id, contrats_progressions(progression_percentage)',
      )
      .eq('archive', false),
  ]);

  if (operationalRes.error) {
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (operational)',
      { error: operationalRes.error },
    );
  }
  const opContrats = operationalRes.data ?? [];
  const formationsActives = new Set<number>();
  let nbAbandons = 0;
  let progSum = 0;
  let progCount = 0;
  for (const c of opContrats) {
    const isActive = ACTIVE_CONTRACT_STATES.has(c.contract_state ?? '');
    const isAbandon =
      c.contract_state === 'resilie' || c.contract_state === 'ANNULE';
    if (isActive && c.eduvia_formation_id != null) {
      formationsActives.add(c.eduvia_formation_id);
    }
    if (isAbandon) nbAbandons += 1;
    if (isActive) {
      const prog = Array.isArray(c.contrats_progressions)
        ? c.contrats_progressions[0]
        : c.contrats_progressions;
      if (prog?.progression_percentage != null) {
        progSum += Number(prog.progression_percentage);
        progCount += 1;
      }
    }
  }
  const pedagogieAvgPct = progCount > 0 ? Math.round(progSum / progCount) : 0;
  const nbFormationsEnCours = formationsActives.size;

  // KPI Qualiopi handicap : % apprenants RQTH parmi apprenants actifs.
  // On charge en une fois les eduvia_employee_id distincts des contrats actifs,
  // puis on look up disabled_worker dans apprenants.
  const activeEmployeePairs = new Set<string>();
  for (const c of opContrats) {
    if (
      ACTIVE_CONTRACT_STATES.has(c.contract_state ?? '') &&
      c.eduvia_employee_id != null &&
      c.source_client_id
    ) {
      activeEmployeePairs.add(`${c.source_client_id}:${c.eduvia_employee_id}`);
    }
  }
  let nbApprenantsRqth = 0;
  let nbApprenantsActifsTotal = 0;
  if (activeEmployeePairs.size > 0) {
    const activeIds = Array.from(activeEmployeePairs).map((p) =>
      Number(p.split(':')[1]),
    );
    const { data: appRes } = await supabase
      .from('apprenants')
      .select('eduvia_id, source_client_id, disabled_worker')
      .in('eduvia_id', activeIds);
    const seen = new Set<string>();
    for (const a of appRes ?? []) {
      const k = `${a.source_client_id}:${a.eduvia_id}`;
      if (!activeEmployeePairs.has(k) || seen.has(k)) continue;
      seen.add(k);
      nbApprenantsActifsTotal += 1;
      if (a.disabled_worker === true) nbApprenantsRqth += 1;
    }
  }
  const rqthPct =
    nbApprenantsActifsTotal > 0
      ? Math.round((nbApprenantsRqth / nbApprenantsActifsTotal) * 100)
      : 0;

  // Log any individual query errors but don't throw - dashboard is best-effort
  if (facturesRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (factures)',
      { error: facturesRes.error },
    );
  if (paiementsRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (paiements)',
      { error: paiementsRes.error },
    );
  if (contratsRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (contrats)',
      { error: contratsRes.error },
    );
  if (tempsRes.error)
    logger.error('queries.dashboard', 'getDashboardFinancials failed (temps)', {
      error: tempsRes.error,
    });
  if (tempsMonthRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (tempsMonth)',
      { error: tempsMonthRes.error },
    );
  if (usersRes.error)
    logger.error('queries.dashboard', 'getDashboardFinancials failed (users)', {
      error: usersRes.error,
    });
  if (feriesRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (feries)',
      { error: feriesRes.error },
    );
  if (echeancesAFacturerRes.error)
    logger.error(
      'queries.dashboard',
      'getDashboardFinancials failed (echeancesAFacturer)',
      { error: echeancesAFacturerRes.error },
    );

  const totalFacture = (facturesRes.data ?? []).reduce(
    (sum, f) => sum + f.montant_ht,
    0,
  );
  // Encaissé ramené en HT au prorata HT/TTC de chaque facture (paiements stockés en TTC).
  const totalEncaisse = (paiementsRes.data ?? []).reduce((sum, p) => {
    const facture = p.facture as {
      montant_ht: number;
      montant_ttc: number;
    } | null;
    return (
      sum +
      encaisseHt(p.montant, facture?.montant_ht ?? 0, facture?.montant_ttc ?? 0)
    );
  }, 0);

  // totalProduction = somme des versements OPCO (schedule 40/30/20/10)
  // qui tombent sur le mois courant. Meme logique que /production en mode OPCO.
  let totalProduction = 0;
  for (const c of contratsProdRes.data ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      0,
    );
    for (const e of schedule.opco) {
      if (e.month === monthKey) totalProduction += e.amount;
    }
  }
  totalProduction = Math.round(totalProduction * 100) / 100;

  // totalEnRetard = somme des factures statut=en_retard moins les paiements
  // partiels deja recus sur ces factures (le solde reellement en retard).
  let totalEnRetard = 0;
  for (const f of facturesRetardRes.data ?? []) {
    const paiements = Array.isArray(f.paiements) ? f.paiements : [];
    const encaisseTtc = paiements.reduce(
      (s: number, p: { montant: number }) => s + p.montant,
      0,
    );
    const encaisse = encaisseHt(encaisseTtc, f.montant_ht, f.montant_ttc);
    totalEnRetard += Math.max(0, f.montant_ht - encaisse);
  }
  totalEnRetard = Math.round(totalEnRetard * 100) / 100;

  // Dedup by eduvia_employee_id : un apprenant avec N contrats compte 1.
  // Les contrats hors Eduvia (employee_id null) sont comptes 1 chacun.
  const apprenantKeys = new Set<string>();
  let sansEmployeeId = 0;
  for (const c of contratsRes.data ?? []) {
    if (c.eduvia_employee_id != null) {
      apprenantKeys.add(String(c.eduvia_employee_id));
    } else {
      sansEmployeeId += 1;
    }
  }
  const nbApprenantsActifs = apprenantKeys.size + sansEmployeeId;

  // Count business days (Mon-Fri) from Monday to today
  let businessDays = 0;
  const cursor = new Date(monday);
  while (cursor <= now) {
    const d = cursor.getDay();
    if (d >= 1 && d <= 5) businessDays++;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Unique days with time entries
  const daysWithEntries = new Set((tempsRes.data ?? []).map((t) => t.date))
    .size;

  const tempsNonSaisi = Math.max(0, businessDays - daysWithEntries);

  // ---- Taux saisie temps (monthly) ----
  const feriesSet = new Set((feriesRes.data ?? []).map((f) => f.date));
  const allDaysInMonth = eachDayOfInterval({
    start: startOfMonth(now),
    end: now <= endOfMonth(now) ? now : endOfMonth(now),
  });
  const monthBusinessDays = allDaysInMonth.filter(
    (d) => !isWeekend(d) && !feriesSet.has(format(d, 'yyyy-MM-dd')),
  ).length;

  const activeUsers = usersRes.count ?? 0;

  // Count distinct (user_id, date) pairs
  const monthEntryPairs = new Set(
    (tempsMonthRes.data ?? []).map((t) => `${t.user_id}|${t.date}`),
  );
  const distinctEntries = monthEntryPairs.size;

  const expectedEntries = monthBusinessDays * activeUsers;
  const tauxSaisieTemps =
    expectedEntries > 0
      ? Math.round((distinctEntries / expectedEntries) * 100)
      : 0;

  type EcheanceMontant = { montant_prevu_ht: number | null };
  const echeancesPretes =
    (echeancesAFacturerRes.data as unknown as EcheanceMontant[]) ?? [];
  // HT : les echeances n'ont que le HT en base (montant_prevu_ht), cohérent avec le funnel HT.
  const totalAFacturer =
    Math.round(
      echeancesPretes.reduce(
        (sum, e) => sum + Number(e.montant_prevu_ht ?? 0),
        0,
      ) * 100,
    ) / 100;

  return {
    totalProduction,
    totalFacture,
    totalEncaisse,
    totalEnRetard,
    totalAFacturer,
    nbApprenantsActifs,
    nbFormationsEnCours,
    nbAbandons,
    pedagogieAvgPct,
    nbApprenantsRqth,
    rqthPct,
    tempsNonSaisi,
    tauxSaisieTemps,
  };
}

// ---------------------------------------------------------------------------
// KPI Snapshots (M-1 comparison)
// ---------------------------------------------------------------------------

export type KpiSnapshotMap = Record<string, number>;

/**
 * Fetch all global KPI snapshots for a given month.
 * Returns a map of type_kpi -> valeur.
 */
export async function getKpiSnapshots(mois: string): Promise<KpiSnapshotMap> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('kpi_snapshots')
    .select('type_kpi, valeur')
    .eq('mois', mois)
    .eq('scope', 'global');

  const map: KpiSnapshotMap = {};
  for (const row of data ?? []) {
    map[row.type_kpi] = row.valeur;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Monthly trend data (last 6 months) for dashboard charts
// ---------------------------------------------------------------------------

export interface MonthlyTrendRow {
  mois: string; // "Janv. 2026" etc.
  production: number;
  facture: number;
  encaisse: number;
  enRetard: number;
}

export async function getMonthlyTrend(): Promise<MonthlyTrendRow[]> {
  const supabase = await createClient();

  // 12 mois glissants pour les sparklines KPI (etait 6 historiquement,
  // toujours OK pour le bar chart RevenueTrendChart qui slice les 6 derniers).
  const now = new Date();
  const months: string[] = [];
  for (let offset = -11; offset <= 0; offset++) {
    const d = startOfMonth(addMonths(now, offset));
    months.push(format(d, 'yyyy-MM-dd'));
  }
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  const [facturesRes, paiementsRes, contratsRes] = await Promise.all([
    supabase
      .from('factures')
      .select('montant_ht, statut, mois_concerne')
      .gte('mois_concerne', firstMonth)
      .lte('mois_concerne', lastMonth)
      .neq('statut', 'avoir'),
    supabase
      .from('paiements')
      .select(
        'montant, facture:factures!paiements_facture_id_fkey(mois_concerne, montant_ht, montant_ttc)',
      )
      .gte('facture.mois_concerne', firstMonth)
      .lte('facture.mois_concerne', lastMonth),
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, npec_amount, projet:projets!contrats_projet_id_fkey(taux_commission)',
      )
      .eq('archive', false),
  ]);

  if (facturesRes.error)
    logger.error('queries.dashboard', 'getMonthlyTrend failed (factures)', {
      error: facturesRes.error,
    });
  if (paiementsRes.error)
    logger.error('queries.dashboard', 'getMonthlyTrend failed (paiements)', {
      error: paiementsRes.error,
    });
  if (contratsRes.error)
    logger.error('queries.dashboard', 'getMonthlyTrend failed (contrats)', {
      error: contratsRes.error,
    });

  // Production from contrats
  const productionByMonth = new Map<string, number>();
  for (const c of contratsRes.data ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const projet = c.projet as { taux_commission: number } | null;
    if (!projet) continue;
    const monthlyProduction =
      Math.round((c.npec_amount / c.duree_mois) * 100) / 100;
    const start = startOfMonth(new Date(c.date_debut + 'T00:00:00'));
    for (let i = 0; i < c.duree_mois; i++) {
      const m = addMonths(start, i);
      const key = format(m, 'yyyy-MM');
      productionByMonth.set(
        key,
        (productionByMonth.get(key) ?? 0) + monthlyProduction,
      );
    }
  }

  // Facturé by month + En retard by month
  const factureByMonth = new Map<string, number>();
  const enRetardByMonth = new Map<string, number>();
  for (const f of facturesRes.data ?? []) {
    if (!f.mois_concerne) continue;
    const key = f.mois_concerne.slice(0, 7);
    factureByMonth.set(key, (factureByMonth.get(key) ?? 0) + f.montant_ht);
    if (f.statut === 'en_retard') {
      enRetardByMonth.set(key, (enRetardByMonth.get(key) ?? 0) + f.montant_ht);
    }
  }

  // Encaissé by month
  const encaisseByMonth = new Map<string, number>();
  for (const p of paiementsRes.data ?? []) {
    const facture = p.facture as {
      mois_concerne: string | null;
      montant_ht: number;
      montant_ttc: number;
    } | null;
    if (!facture?.mois_concerne) continue;
    const key = facture.mois_concerne.slice(0, 7);
    encaisseByMonth.set(
      key,
      (encaisseByMonth.get(key) ?? 0) +
        encaisseHt(p.montant, facture.montant_ht, facture.montant_ttc),
    );
  }

  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const d = new Date(mois + 'T00:00:00');
    const label = capitalize(format(d, 'MMM yyyy', { locale: fr }));
    return {
      mois: label,
      production: Math.round((productionByMonth.get(key) ?? 0) * 100) / 100,
      facture: Math.round((factureByMonth.get(key) ?? 0) * 100) / 100,
      encaisse: Math.round((encaisseByMonth.get(key) ?? 0) * 100) / 100,
      enRetard: Math.round((enRetardByMonth.get(key) ?? 0) * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// Invoice status breakdown for dashboard pie chart
// ---------------------------------------------------------------------------

export interface InvoiceStatusBreakdown {
  emises: number;
  payees: number;
  en_retard: number;
  avoirs: number;
}

export async function getInvoiceStatusBreakdown(): Promise<InvoiceStatusBreakdown> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('factures').select('statut');

  if (error)
    logger.error('queries.dashboard', 'getInvoiceStatusBreakdown failed', {
      error,
    });

  const factures = data ?? [];
  return {
    emises: factures.filter((f) => f.statut === 'emise').length,
    payees: factures.filter((f) => f.statut === 'payee').length,
    en_retard: factures.filter((f) => f.statut === 'en_retard').length,
    avoirs: factures.filter((f) => f.statut === 'avoir').length,
  };
}

// ---------------------------------------------------------------------------
// Taux saisie temps (standalone, for KPI card)
// ---------------------------------------------------------------------------

export interface TauxSaisieTemps {
  taux: number; // percentage 0-100
}

// ---------------------------------------------------------------------------
// Current user's week hours (for dashboard personal time widget)
// ---------------------------------------------------------------------------

export async function getUserWeekHours(): Promise<number> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Compute Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayStr = format(monday, 'yyyy-MM-dd');

  // Friday of current week
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fridayStr = format(friday, 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('saisies_temps')
    .select('heures')
    .eq('user_id', user.id)
    .gte('date', mondayStr)
    .lte('date', fridayStr);

  if (error) {
    logger.error('queries.dashboard', 'getUserWeekHours failed', { error });
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + (row.heures ?? 0), 0);
}
