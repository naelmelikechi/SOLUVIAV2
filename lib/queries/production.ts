import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// -----------------------------------------------------------------------------
// Pure computation: theoretical payment schedule per contract
//
// OPCO side (100% du NPEC étalé en 4 versements) :
//   - M+1  : 40% (approximation "30j après la 1ère facture CFA→OPCO", affiné
//            quand Eduvia fournira le réel encaissé)
//   - M+7  : 30%
//   - M+10 : 20%
//   - M+(dureeMois)+1 : 10% (approximation "dans les 4 mois suivant le terme")
//
// SOLUVIA side (12 mensualités = NPEC × tauxCommission / 100) :
//   - M+3 à M+14 inclus, chaque mensualité = (NPEC × taux / 100) / 12
// -----------------------------------------------------------------------------

export interface ScheduleEntry {
  /** YYYY-MM first-of-month key */
  month: string;
  amount: number;
}

export interface ContractSchedule {
  /** 4 versements OPCO = 100% NPEC */
  opco: ScheduleEntry[];
  /** 12 mensualités SOLUVIA = NPEC × tauxCommission / 100 */
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
// Data types exposed to the UI
// -----------------------------------------------------------------------------

export interface ProductionRow {
  projetId: string;
  projetRef: string;
  clientName: string;
  monthKey: string;
  monthLabel: string;
  montantOpco: number;
  montantSoluvia: number;
}

export interface ProductionKpis {
  year: number;
  currentMonthKey: string;
  totalOpcoYear: number;
  totalSoluviaYear: number;
  totalOpcoCurrentMonth: number;
  totalSoluviaCurrentMonth: number;
}

export interface ProductionMonthlyTotal {
  monthKey: string;
  /** Short label (e.g. "Avr") for the chart X-axis */
  monthLabel: string;
  opco: number;
  soluvia: number;
}

export interface ProductionPageData {
  year: number;
  rows: ProductionRow[];
  kpis: ProductionKpis;
  monthlyTotals: ProductionMonthlyTotal[];
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

const MONTH_LABELS_FULL = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const MONTH_LABELS_SHORT = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

function formatMonthLabelFull(key: string): string {
  const [year, month] = key.split('-');
  const idx = Number(month ?? 0) - 1;
  return `${MONTH_LABELS_FULL[idx] ?? month} ${year}`;
}

// -----------------------------------------------------------------------------
// Main query - one pass, returns everything needed by the page
// -----------------------------------------------------------------------------

export async function getProductionPageData(
  year: number,
): Promise<ProductionPageData> {
  const supabase = await createClient();

  const { data: contrats, error } = await supabase
    .from('contrats')
    .select(
      `
      date_debut,
      duree_mois,
      montant_prise_en_charge,
      projet:projets!contrats_projet_id_fkey (
        id,
        ref,
        taux_commission,
        client:clients!projets_client_id_fkey (
          raison_sociale
        )
      )
    `,
    )
    .eq('archive', false);

  if (error) {
    logger.error('queries.production', 'getProductionPageData failed', {
      error,
    });
    return emptyPageData(year);
  }

  // Aggregate by (projetId, monthKey)
  const aggMap = new Map<
    string,
    {
      projetId: string;
      projetRef: string;
      clientName: string;
      monthKey: string;
      opco: number;
      soluvia: number;
    }
  >();

  for (const c of contrats ?? []) {
    if (!c.date_debut || !c.duree_mois) continue;
    if (!c.montant_prise_en_charge) continue;

    const projet = c.projet as unknown as {
      id: string;
      ref: string | null;
      taux_commission: number;
      client: { raison_sociale: string } | null;
    } | null;
    if (!projet) continue;

    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.montant_prise_en_charge,
      projet.taux_commission ?? 10,
    );

    const applyEntry = (e: ScheduleEntry, kind: 'opco' | 'soluvia') => {
      if (Number(e.month.slice(0, 4)) !== year) return;
      const key = `${projet.id}|${e.month}`;
      const entry = aggMap.get(key) ?? {
        projetId: projet.id,
        projetRef: projet.ref ?? '',
        clientName: projet.client?.raison_sociale ?? '',
        monthKey: e.month,
        opco: 0,
        soluvia: 0,
      };
      if (kind === 'opco') entry.opco += e.amount;
      else entry.soluvia += e.amount;
      aggMap.set(key, entry);
    };

    for (const e of schedule.opco) applyEntry(e, 'opco');
    for (const e of schedule.soluvia) applyEntry(e, 'soluvia');
  }

  const rows: ProductionRow[] = Array.from(aggMap.values())
    .map((a) => ({
      projetId: a.projetId,
      projetRef: a.projetRef,
      clientName: a.clientName,
      monthKey: a.monthKey,
      monthLabel: formatMonthLabelFull(a.monthKey),
      montantOpco: round2(a.opco),
      montantSoluvia: round2(a.soluvia),
    }))
    .sort((a, b) => {
      if (a.projetRef !== b.projetRef)
        return a.projetRef.localeCompare(b.projetRef);
      return a.monthKey.localeCompare(b.monthKey);
    });

  // KPIs
  const currentMonthKey = monthKey(new Date());
  let totalOpcoYear = 0;
  let totalSoluviaYear = 0;
  let totalOpcoCurrentMonth = 0;
  let totalSoluviaCurrentMonth = 0;
  for (const r of rows) {
    totalOpcoYear += r.montantOpco;
    totalSoluviaYear += r.montantSoluvia;
    if (r.monthKey === currentMonthKey) {
      totalOpcoCurrentMonth += r.montantOpco;
      totalSoluviaCurrentMonth += r.montantSoluvia;
    }
  }

  // Monthly totals for the chart (12 buckets, zero-filled)
  const monthlyTotals: ProductionMonthlyTotal[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    monthlyTotals.push({
      monthKey: key,
      monthLabel: MONTH_LABELS_SHORT[m - 1] ?? '',
      opco: 0,
      soluvia: 0,
    });
  }
  for (const r of rows) {
    const idx = Number(r.monthKey.slice(5)) - 1;
    const bucket = monthlyTotals[idx];
    if (bucket) {
      bucket.opco = round2(bucket.opco + r.montantOpco);
      bucket.soluvia = round2(bucket.soluvia + r.montantSoluvia);
    }
  }

  return {
    year,
    rows,
    kpis: {
      year,
      currentMonthKey,
      totalOpcoYear: round2(totalOpcoYear),
      totalSoluviaYear: round2(totalSoluviaYear),
      totalOpcoCurrentMonth: round2(totalOpcoCurrentMonth),
      totalSoluviaCurrentMonth: round2(totalSoluviaCurrentMonth),
    },
    monthlyTotals,
  };
}

function emptyPageData(year: number): ProductionPageData {
  const currentMonthKey = monthKey(new Date());
  return {
    year,
    rows: [],
    kpis: {
      year,
      currentMonthKey,
      totalOpcoYear: 0,
      totalSoluviaYear: 0,
      totalOpcoCurrentMonth: 0,
      totalSoluviaCurrentMonth: 0,
    },
    monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
      monthKey: `${year}-${String(i + 1).padStart(2, '0')}`,
      monthLabel: MONTH_LABELS_SHORT[i] ?? '',
      opco: 0,
      soluvia: 0,
    })),
  };
}
