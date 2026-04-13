import { createClient } from '@/lib/supabase/server';
import { format, startOfMonth, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function getDashboardData() {
  const supabase = await createClient();

  const [projetsRes, facturesRes, tachesRes, echeancesRes, contratsRes] =
    await Promise.all([
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
    ]);

  return {
    projetsActifs: projetsRes.data?.length ?? 0,
    facturesEnRetard:
      facturesRes.data?.filter((f) => f.statut === 'en_retard').length ?? 0,
    facturesEmises:
      facturesRes.data?.filter((f) => f.statut === 'emise').length ?? 0,
    tachesEnAttente: tachesRes.data?.length ?? 0,
    echeancesAFacturer: echeancesRes.data?.length ?? 0,
    contratsActifs: contratsRes.data?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Production data (monthly breakdown for the Production page)
// ---------------------------------------------------------------------------

export interface ProductionRow {
  mois: string; // YYYY-MM-DD (first of month)
  label: string; // "Janvier 2026" etc.
  production: number; // revenue earned (uses facture as proxy)
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

  // Fetch factures within the month range
  const { data: factures } = await supabase
    .from('factures')
    .select('montant_ht, statut, mois_concerne')
    .gte('mois_concerne', firstMonth)
    .lte('mois_concerne', lastMonth)
    .neq('statut', 'avoir');

  // Fetch paiements with their facture's mois_concerne
  const { data: paiements } = await supabase
    .from('paiements')
    .select(
      'montant, facture:factures!paiements_facture_id_fkey(mois_concerne)',
    )
    .gte('facture.mois_concerne', firstMonth)
    .lte('facture.mois_concerne', lastMonth);

  // Build lookup maps keyed by mois (YYYY-MM)
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

  // Assemble rows
  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const fData = factureByMonth.get(key);
    const facture = fData?.facture ?? 0;
    const en_retard = fData?.en_retard ?? 0;
    const encaisse = encaisseByMonth.get(key) ?? 0;

    // Use facture as proxy for production (task spec says this is acceptable)
    const production = facture;

    const d = new Date(mois + 'T00:00:00');
    const label = capitalize(format(d, 'MMM yyyy', { locale: fr }));

    return { mois, label, production, facture, encaisse, en_retard };
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

  const [facturesRes, paiementsRes, contratsRes, tempsRes] = await Promise.all([
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
  ]);

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

  return {
    totalProduction,
    totalFacture,
    totalEncaisse,
    nbApprenantsActifs,
    tempsNonSaisi,
  };
}
