import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { computeContractSchedule } from '@/lib/queries/production';
import { encaisseHt } from '@/lib/utils/montant-ht';
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

  // Production from contrats = commission SOLUVIA (NPEC × taux, HT) prorata durée.
  const productionByMonth = new Map<string, number>();
  for (const c of contratsRes.data ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;
    const projet = c.projet as { taux_commission: number } | null;
    if (!projet) continue;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      projet.taux_commission ?? 0,
    );
    for (const e of schedule.soluvia) {
      productionByMonth.set(
        e.month,
        (productionByMonth.get(e.month) ?? 0) + e.amount,
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
