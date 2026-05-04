import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// -----------------------------------------------------------------------------
// Pure computation: theoretical payment schedule per contract
//
// OPCO side (100% du NPEC etale en 4 versements) :
//   - M+1  : 40% (approximation "30j apres la 1ere facture CFA->OPCO", affine
//            quand Eduvia fournira le reel encaisse)
//   - M+7  : 30%
//   - M+10 : 20%
//   - M+(dureeMois)+1 : 10% (approximation "dans les 4 mois suivant le terme")
//
// SOLUVIA side (12 mensualites = NPEC x tauxCommission / 100) :
//   - M+3 a M+14 inclus, chaque mensualite = (NPEC x taux / 100) / 12
// -----------------------------------------------------------------------------

export interface ScheduleEntry {
  /** YYYY-MM first-of-month key */
  month: string;
  amount: number;
}

export interface ContractSchedule {
  /** 4 versements OPCO = 100% NPEC */
  opco: ScheduleEntry[];
  /** 12 mensualites SOLUVIA = NPEC x tauxCommission / 100 */
  soluvia: ScheduleEntry[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthsKey(start: Date, n: number): string {
  const d = new Date(start);
  d.setMonth(d.getMonth() + n);
  return monthKey(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeContractSchedule(
  dateDebutIso: string,
  dureeMois: number,
  npec: number,
  tauxCommissionPct: number,
): ContractSchedule {
  const start = new Date(dateDebutIso + 'T00:00:00');
  if (isNaN(start.getTime()) || dureeMois <= 0 || npec <= 0) {
    return { opco: [], soluvia: [] };
  }

  const opco: ScheduleEntry[] = [
    { month: addMonthsKey(start, 1), amount: round2(npec * 0.4) },
    { month: addMonthsKey(start, 7), amount: round2(npec * 0.3) },
    { month: addMonthsKey(start, 10), amount: round2(npec * 0.2) },
    { month: addMonthsKey(start, dureeMois + 1), amount: round2(npec * 0.1) },
  ];

  const totalSoluvia = (npec * tauxCommissionPct) / 100;
  const mensualite = round2(totalSoluvia / 12);
  const soluvia: ScheduleEntry[] = [];
  for (let i = 0; i < 12; i++) {
    soluvia.push({ month: addMonthsKey(start, 3 + i), amount: mensualite });
  }

  return { opco, soluvia };
}

// -----------------------------------------------------------------------------
// 25-month rolling window data (12 past + current + 12 future)
// -----------------------------------------------------------------------------

export interface ProductionRow {
  /** YYYY-MM-DD (first of month) */
  mois: string;
  /** "Avr 2026" */
  label: string;
  /** OPCO theoretical revenue from contract schedule */
  production: number;
  /** SOLUVIA theoretical revenue (NPEC x taux / 100, etale 12 mois) */
  productionSoluvia: number;
  /** Sum of factures.montant_ht for the month */
  facture: number;
  /** Sum of paiements.montant for the month */
  encaisse: number;
  /** Sum of factures.montant_ht with statut = 'en_retard' */
  en_retard: number;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 25-month window: 12 past + current + 12 future, ISO YYYY-MM-DD strings. */
function buildMonthRange(): string[] {
  const today = new Date();
  const months: string[] = [];
  for (let offset = -12; offset <= 12; offset++) {
    const d = startOfMonth(addMonths(today, offset));
    months.push(format(d, 'yyyy-MM-dd'));
  }
  return months;
}

export async function getProductionData(): Promise<ProductionRow[]> {
  const supabase = await createClient();

  const months = buildMonthRange();
  const firstMonth = months[0]!;
  const lastMonth = months[months.length - 1]!;

  // Exclude clients demo (is_demo=true) et archives : leurs factures gonflent
  // les KPIs sans correspondre a de la production reelle. !inner force la
  // jointure cote SQL pour que le filtre s'applique reellement.
  const [facturesRes, paiementsRes, contratsRes] = await Promise.all([
    supabase
      .from('factures')
      .select(
        'montant_ht, statut, mois_concerne, client:clients!inner(is_demo, archive)',
      )
      .gte('mois_concerne', firstMonth)
      .lte('mois_concerne', lastMonth)
      .neq('statut', 'avoir')
      .eq('client.is_demo', false)
      .eq('client.archive', false),

    supabase
      .from('paiements')
      .select(
        'montant, facture:factures!inner(mois_concerne, client:clients!inner(is_demo, archive))',
      )
      .gte('facture.mois_concerne', firstMonth)
      .lte('facture.mois_concerne', lastMonth)
      .eq('facture.client.is_demo', false)
      .eq('facture.client.archive', false),

    supabase
      .from('contrats')
      .select(
        'date_debut, duree_mois, npec_amount, projet:projets!inner(taux_commission, client:clients!inner(is_demo, archive))',
      )
      .eq('archive', false)
      .eq('projet.client.is_demo', false)
      .eq('projet.client.archive', false),
  ]);

  if (facturesRes.error)
    logger.error('queries.production', 'getProductionData failed (factures)', {
      error: facturesRes.error,
    });
  if (paiementsRes.error)
    logger.error('queries.production', 'getProductionData failed (paiements)', {
      error: paiementsRes.error,
    });
  if (contratsRes.error)
    logger.error('queries.production', 'getProductionData failed (contrats)', {
      error: contratsRes.error,
    });

  // ---------------------------------------------------------------------------
  // 1. Theoretical production per month (OPCO + SOLUVIA) from the new schedule
  // ---------------------------------------------------------------------------
  const productionByMonth = new Map<string, number>();
  const productionSoluviaByMonth = new Map<string, number>();

  for (const c of contratsRes.data ?? []) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;

    const projet = c.projet as { taux_commission: number } | null;
    if (!projet) continue;

    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      projet.taux_commission ?? 10,
    );

    for (const e of schedule.opco) {
      productionByMonth.set(
        e.month,
        (productionByMonth.get(e.month) ?? 0) + e.amount,
      );
    }
    for (const e of schedule.soluvia) {
      productionSoluviaByMonth.set(
        e.month,
        (productionSoluviaByMonth.get(e.month) ?? 0) + e.amount,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Real factures / encaissements / retard from DB
  // ---------------------------------------------------------------------------
  const factureByMonth = new Map<
    string,
    { facture: number; en_retard: number }
  >();
  const encaisseByMonth = new Map<string, number>();

  for (const f of facturesRes.data ?? []) {
    if (!f.mois_concerne) continue;
    const key = f.mois_concerne.slice(0, 7);
    const entry = factureByMonth.get(key) ?? { facture: 0, en_retard: 0 };
    entry.facture += f.montant_ht;
    if (f.statut === 'en_retard') entry.en_retard += f.montant_ht;
    factureByMonth.set(key, entry);
  }

  for (const p of paiementsRes.data ?? []) {
    const facture = p.facture as { mois_concerne: string | null } | null;
    if (!facture?.mois_concerne) continue;
    const key = facture.mois_concerne.slice(0, 7);
    encaisseByMonth.set(key, (encaisseByMonth.get(key) ?? 0) + p.montant);
  }

  // ---------------------------------------------------------------------------
  // 3. Assemble 25 rows
  // ---------------------------------------------------------------------------
  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const f = factureByMonth.get(key);
    const facture = round2(f?.facture ?? 0);
    const en_retard = round2(f?.en_retard ?? 0);
    const encaisse = round2(encaisseByMonth.get(key) ?? 0);
    const production = round2(productionByMonth.get(key) ?? 0);
    const productionSoluvia = round2(productionSoluviaByMonth.get(key) ?? 0);

    const d = new Date(mois + 'T00:00:00');
    const label = capitalize(format(d, 'MMM yyyy', { locale: fr }));

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
