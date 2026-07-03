import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeContractSchedule } from '@/lib/queries/production';
import {
  getContratsActifs,
  getMonthSums,
} from '@/lib/queries/production-aggregates';
import { capitalize } from '@/lib/utils/strings';
import { format, startOfMonth, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import type {
  KpiSnapshotMap,
  MonthlyTrendRow,
  InvoiceStatusBreakdown,
} from './shared';

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
  // mois_concerne est un TEXT a formats mixtes ('YYYY-MM' pour certaines
  // factures, 'YYYY-MM-01' pour d'autres) : on borne avec des cles courtes
  // 'YYYY-MM' (.gte premier mois, .lt mois SUIVANT le dernier), correct
  // lexicographiquement pour les deux formats. Une borne basse 'YYYY-MM-01'
  // exclurait a tort les valeurs 'YYYY-MM' du premier mois.
  const firstMonthKey = format(startOfMonth(addMonths(now, -11)), 'yyyy-MM');
  const nextMonthKey = format(startOfMonth(addMonths(now, 1)), 'yyyy-MM');
  const currentMonthKey = format(startOfMonth(now), 'yyyy-MM');

  // Sommes factures/paiements et contrats actifs via le module partage
  // production-aggregates (RPC SQL, fallback fetchAllRows). Deux alignements
  // volontaires sur getProductionData au passage :
  // - est_avoir=false remplace .neq('statut','avoir') qui laissait passer
  //   les avoirs en brouillon (statut 'a_emettre') en negatif ;
  // - filtre demo/archive via factures.client_id direct (au lieu du chemin
  //   projet->client, equivalent : client_id de la facture = celui du projet).
  // Bonus : les selects factures/paiements n'etaient pas pagines ici
  // (troncature silencieuse a max_rows=1000), la RPC somme tout cote base.
  const [monthSums, contrats] = await Promise.all([
    getMonthSums(supabase, firstMonthKey, nextMonthKey),
    getContratsActifs(supabase, firstMonthKey, currentMonthKey),
  ]);

  // Production from contrats = commission SOLUVIA (NPEC × taux, HT) prorata durée.
  const productionByMonth = new Map<string, number>();
  for (const c of contrats) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      c.taux_commission ?? 0,
    );
    for (const e of schedule.soluvia) {
      productionByMonth.set(
        e.month,
        (productionByMonth.get(e.month) ?? 0) + e.amount,
      );
    }
  }

  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const d = new Date(mois + 'T00:00:00');
    const label = capitalize(format(d, 'MMM yyyy', { locale: fr }));
    const sums = monthSums.get(key);
    return {
      mois: label,
      production: Math.round((productionByMonth.get(key) ?? 0) * 100) / 100,
      facture: Math.round((sums?.facture ?? 0) * 100) / 100,
      encaisse: Math.round((sums?.encaisse ?? 0) * 100) / 100,
      enRetard: Math.round((sums?.en_retard ?? 0) * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// Invoice status breakdown for dashboard pie chart
// ---------------------------------------------------------------------------

export async function getInvoiceStatusBreakdown(): Promise<InvoiceStatusBreakdown> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('count_factures_by_statut');

  if (error)
    logger.error('queries.dashboard', 'getInvoiceStatusBreakdown failed', {
      error,
    });

  const byStatut = new Map<string, number>(
    (data ?? []).map((r) => [r.statut, Number(r.n)]),
  );
  return {
    emises: byStatut.get('emise') ?? 0,
    payees: byStatut.get('payee') ?? 0,
    en_retard: byStatut.get('en_retard') ?? 0,
    avoirs: byStatut.get('avoir') ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Current user's week hours (for dashboard personal time widget)
// ---------------------------------------------------------------------------
