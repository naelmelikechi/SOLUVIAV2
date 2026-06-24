import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { ACTIVE_CONTRACT_STATES } from '@/lib/utils/contrat-states';
import { computeContractSchedule } from '@/lib/queries/production';
import type { Periode } from '@/lib/utils/dashboard-periode';
import { encaisseHt } from '@/lib/utils/montant-ht';
import {
  format,
  startOfMonth,
  eachDayOfInterval,
  endOfMonth,
  isWeekend,
} from 'date-fns';
import { ACTIVE_STATES_ARRAY, type DashboardFinancials } from './shared';

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
    // Contrats pour calcul Production du mois (commission prorata durée)
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, npec_amount, projet:projets!contrats_projet_id_fkey!inner(taux_commission, client:clients!projets_client_id_fkey!inner(is_demo, archive))',
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

  // totalProduction = commission SOLUVIA (NPEC × taux, HT) prorata sur la durée
  // du contrat, part qui tombe sur le mois courant. Indépendant de la facturation.
  let totalProduction = 0;
  for (const c of contratsProdRes.data ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const projet = c.projet as { taux_commission: number | null } | null;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      projet?.taux_commission ?? 0,
    );
    for (const e of schedule.soluvia) {
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
