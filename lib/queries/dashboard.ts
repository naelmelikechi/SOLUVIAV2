import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import {
  format,
  startOfMonth,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  isWeekend,
} from 'date-fns';
import { fr } from 'date-fns/locale';

export async function getDashboardData() {
  const supabase = await createClient();

  // 30 days ago for stale contrats detection
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = format(thirtyDaysAgo, 'yyyy-MM-dd');

  const [
    projetsRes,
    facturesRes,
    tachesRes,
    echeancesRes,
    contratsRes,
    staleContratsRes,
  ] = await Promise.all([
    supabase
      .from('projets')
      .select('id')
      .eq('statut', 'actif')
      .eq('est_absence', false),
    supabase.from('factures').select('id, statut'),
    supabase.from('taches_qualite').select('id').eq('fait', false),
    supabase
      .from('echeances')
      .select('id')
      .is('facture_id', null)
      .eq('validee', false),
    supabase
      .from('contrats')
      .select('id')
      .eq('contract_state', 'actif')
      .eq('archive', false),
    // Contrats actifs started > 30 days ago — candidates for "sans progression"
    supabase
      .from('contrats')
      .select('id, projet_id')
      .eq('archive', false)
      .in('contract_state', ['actif', 'en_cours', 'signe'])
      .lt('date_debut', thirtyDaysAgoStr),
  ]);

  // Log any individual query errors but don't throw — dashboard is best-effort
  if (projetsRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (projets)', {
      error: projetsRes.error,
    });
  if (facturesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (factures)', {
      error: facturesRes.error,
    });
  if (tachesRes.error)
    logger.error('queries.dashboard', 'getDashboardData failed (taches)', {
      error: tachesRes.error,
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

  // Check which stale contrats have no time entries in the last 30 days
  // saisies_temps tracks at projet level, so we check by projet_id
  const staleContrats = staleContratsRes.data ?? [];
  const staleProjetIds = [...new Set(staleContrats.map((c) => c.projet_id))];
  let contratsSansProgression = 0;
  if (staleProjetIds.length > 0) {
    const { data: recentSaisies } = await supabase
      .from('saisies_temps')
      .select('projet_id')
      .in('projet_id', staleProjetIds)
      .gte('date', thirtyDaysAgoStr);

    const projetsWithActivity = new Set(
      (recentSaisies ?? []).map((s) => s.projet_id),
    );
    // Count contrats whose project has no recent activity
    contratsSansProgression = staleContrats.filter(
      (c) => !projetsWithActivity.has(c.projet_id),
    ).length;
  }

  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard:
      facturesRes.data?.filter((f) => f.statut === 'en_retard').length ?? 0,
    facturesEmises:
      facturesRes.data?.filter((f) => f.statut === 'emise').length ?? 0,
    tachesEnAttente: tachesRes.data?.length ?? 0,
    echeancesAFacturer: echeancesRes.data?.length ?? 0,
    contratsActifs: contratsRes.data?.length ?? 0,
    contratsSansProgression,
  };
}

// ---------------------------------------------------------------------------
// Production data (monthly breakdown for the Production page)
// ---------------------------------------------------------------------------

export interface ProductionRow {
  mois: string; // YYYY-MM-DD (first of month)
  label: string; // "Janvier 2026" etc.
  production: number; // revenue earned OPCO (prorated from active contrats)
  productionSoluvia: number; // revenue SOLUVIA (production × taux_commission per contrat)
  facture: number; // invoiced amount
  encaisse: number; // collected amount
  en_retard: number; // overdue amount
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a 13-month window: 6 past + current + 6 future.
 * Returns ISO date strings (YYYY-MM-DD) for the first of each month.
 */
function buildMonthRange(): string[] {
  const today = new Date();
  const months: string[] = [];
  for (let offset = -6; offset <= 6; offset++) {
    const d = startOfMonth(addMonths(today, offset));
    months.push(format(d, 'yyyy-MM-dd'));
  }
  return months;
}

export async function getProductionData(): Promise<ProductionRow[]> {
  const supabase = await createClient();

  const months = buildMonthRange();
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  // Fetch all data in parallel
  const [facturesRes, paiementsRes, contratsRes] = await Promise.all([
    // Factures within the month range
    supabase
      .from('factures')
      .select('montant_ht, statut, mois_concerne')
      .gte('mois_concerne', firstMonth)
      .lte('mois_concerne', lastMonth)
      .neq('statut', 'avoir'),

    // Paiements with their facture's mois_concerne
    supabase
      .from('paiements')
      .select(
        'montant, facture:factures!paiements_facture_id_fkey(mois_concerne)',
      )
      .gte('facture.mois_concerne', firstMonth)
      .lte('facture.mois_concerne', lastMonth),

    // Non-archived contrats with their projet's taux_commission
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, montant_prise_en_charge, projet:projets!contrats_projet_id_fkey(taux_commission)',
      )
      .eq('archive', false),
  ]);

  // Log any individual query errors but don't throw — production page is best-effort
  if (facturesRes.error)
    logger.error('queries.dashboard', 'getProductionData failed (factures)', {
      error: facturesRes.error,
    });
  if (paiementsRes.error)
    logger.error('queries.dashboard', 'getProductionData failed (paiements)', {
      error: paiementsRes.error,
    });
  if (contratsRes.error)
    logger.error('queries.dashboard', 'getProductionData failed (contrats)', {
      error: contratsRes.error,
    });

  const factures = facturesRes.data;
  const paiements = paiementsRes.data;
  const contrats = contratsRes.data;

  // ---------------------------------------------------------------------------
  // 1. Compute real production month-by-month from contrats
  // ---------------------------------------------------------------------------
  const productionByMonth = new Map<string, number>();
  const productionSoluviaByMonth = new Map<string, number>();

  for (const c of contrats ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.montant_prise_en_charge || c.montant_prise_en_charge <= 0) continue;

    const projet = c.projet as { taux_commission: number } | null;
    if (!projet) continue;

    const tauxCommission = (projet.taux_commission ?? 10) / 100;

    // Monthly production at OPCO level = full montant / duration
    const monthlyProduction =
      Math.round((c.montant_prise_en_charge / c.duree_mois) * 100) / 100;
    // SOLUVIA = OPCO × taux_commission (per contrat, per projet)
    const monthlySoluvia =
      Math.round(monthlyProduction * tauxCommission * 100) / 100;

    const start = startOfMonth(new Date(c.date_debut + 'T00:00:00'));
    for (let i = 0; i < c.duree_mois; i++) {
      const m = addMonths(start, i);
      const key = format(m, 'yyyy-MM');
      productionByMonth.set(
        key,
        (productionByMonth.get(key) ?? 0) + monthlyProduction,
      );
      productionSoluviaByMonth.set(
        key,
        (productionSoluviaByMonth.get(key) ?? 0) + monthlySoluvia,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Build facturé and encaissé lookup maps keyed by mois (YYYY-MM)
  // ---------------------------------------------------------------------------
  const factureByMonth = new Map<
    string,
    { facture: number; en_retard: number }
  >();
  const encaisseByMonth = new Map<string, number>();

  for (const f of factures ?? []) {
    if (!f.mois_concerne) continue;
    const key = f.mois_concerne.slice(0, 7); // YYYY-MM
    const entry = factureByMonth.get(key) ?? { facture: 0, en_retard: 0 };
    entry.facture += f.montant_ht;
    if (f.statut === 'en_retard') {
      entry.en_retard += f.montant_ht;
    }
    factureByMonth.set(key, entry);
  }

  for (const p of paiements ?? []) {
    // When using a relation filter, Supabase returns null for the relation
    // if the filter doesn't match — skip those
    const facture = p.facture as { mois_concerne: string | null } | null;
    if (!facture?.mois_concerne) continue;
    const key = facture.mois_concerne.slice(0, 7);
    encaisseByMonth.set(key, (encaisseByMonth.get(key) ?? 0) + p.montant);
  }

  // ---------------------------------------------------------------------------
  // 3. Assemble rows
  // ---------------------------------------------------------------------------
  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const fData = factureByMonth.get(key);
    const facture = Math.round((fData?.facture ?? 0) * 100) / 100;
    const en_retard = Math.round((fData?.en_retard ?? 0) * 100) / 100;
    const encaisse = Math.round((encaisseByMonth.get(key) ?? 0) * 100) / 100;
    const production =
      Math.round((productionByMonth.get(key) ?? 0) * 100) / 100;

    const d = new Date(mois + 'T00:00:00');
    const label = capitalize(format(d, 'MMM yyyy', { locale: fr }));

    const productionSoluvia =
      Math.round((productionSoluviaByMonth.get(key) ?? 0) * 100) / 100;

    return {
      mois,
      label,
      production,
      productionSoluvia,
      facture,
      encaisse,
      en_retard,
    };
  });
}

// ---------------------------------------------------------------------------
// Dashboard financial KPIs
// ---------------------------------------------------------------------------

export interface DashboardFinancials {
  totalProduction: number; // sum of factures.montant_ht for emise/payee/en_retard
  totalFacture: number; // same scope
  totalEncaisse: number; // sum of paiements.montant
  nbApprenantsActifs: number; // count of active contrats
  tempsNonSaisi: number; // days without time entries this week
  tauxSaisieTemps: number; // % of time entries filled this month
}

export async function getDashboardFinancials(): Promise<DashboardFinancials> {
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

  const [
    facturesRes,
    paiementsRes,
    contratsRes,
    tempsRes,
    tempsMonthRes,
    usersRes,
    feriesRes,
  ] = await Promise.all([
    supabase
      .from('factures')
      .select('montant_ht, statut')
      .in('statut', ['emise', 'payee', 'en_retard']),
    supabase.from('paiements').select('montant'),
    supabase
      .from('contrats')
      .select('id')
      .eq('archive', false)
      .in('contract_state', ['actif', 'en_cours', 'signe']),
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
  ]);

  // Log any individual query errors but don't throw — dashboard is best-effort
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

  const totalFacture = (facturesRes.data ?? []).reduce(
    (sum, f) => sum + f.montant_ht,
    0,
  );
  const totalEncaisse = (paiementsRes.data ?? []).reduce(
    (sum, p) => sum + p.montant,
    0,
  );

  // For totalProduction we use the same as totalFacture (proxy)
  const totalProduction = totalFacture;

  const nbApprenantsActifs = contratsRes.data?.length ?? 0;

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

  return {
    totalProduction,
    totalFacture,
    totalEncaisse,
    nbApprenantsActifs,
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
}

export async function getMonthlyTrend(): Promise<MonthlyTrendRow[]> {
  const supabase = await createClient();

  const now = new Date();
  const months: string[] = [];
  for (let offset = -5; offset <= 0; offset++) {
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
        'montant, facture:factures!paiements_facture_id_fkey(mois_concerne)',
      )
      .gte('facture.mois_concerne', firstMonth)
      .lte('facture.mois_concerne', lastMonth),
    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, montant_prise_en_charge, projet:projets!contrats_projet_id_fkey(taux_commission)',
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
    if (!c.montant_prise_en_charge || c.montant_prise_en_charge <= 0) continue;
    const projet = c.projet as { taux_commission: number } | null;
    if (!projet) continue;
    const monthlyProduction =
      Math.round((c.montant_prise_en_charge / c.duree_mois) * 100) / 100;
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

  // Facturé by month
  const factureByMonth = new Map<string, number>();
  for (const f of facturesRes.data ?? []) {
    if (!f.mois_concerne) continue;
    const key = f.mois_concerne.slice(0, 7);
    factureByMonth.set(key, (factureByMonth.get(key) ?? 0) + f.montant_ht);
  }

  // Encaissé by month
  const encaisseByMonth = new Map<string, number>();
  for (const p of paiementsRes.data ?? []) {
    const facture = p.facture as { mois_concerne: string | null } | null;
    if (!facture?.mois_concerne) continue;
    const key = facture.mois_concerne.slice(0, 7);
    encaisseByMonth.set(key, (encaisseByMonth.get(key) ?? 0) + p.montant);
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
