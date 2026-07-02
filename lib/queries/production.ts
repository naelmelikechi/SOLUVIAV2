import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { logger } from '@/lib/utils/logger';
import { encaisseHt, ttcToHt } from '@/lib/utils/montant-ht';
import { round2 } from '@/lib/utils/number';
import { capitalize } from '@/lib/utils/strings';

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
// SOLUVIA side = PRODUCTION (commission, prorata sur la duree du contrat) :
//   - commission TTC = NPEC x tauxCommission / 100, puis HT = TTC / 1.2
//   - repartie de M+0 (date_debut) a M+(dureeMois-1), chaque mois = commissionHt / dureeMois
//   - independant de la facturation reelle (qui depend de la societe emettrice)
// -----------------------------------------------------------------------------

export interface ScheduleEntry {
  /** YYYY-MM first-of-month key */
  month: string;
  amount: number;
}

export interface ContractSchedule {
  /** 4 versements OPCO = 100% NPEC */
  opco: ScheduleEntry[];
  /** Production SOLUVIA = commission HT (NPEC x taux / 100 / 1.2) prorata sur dureeMois */
  soluvia: ScheduleEntry[];
}

function addMonthsKey(start: Date, n: number): string {
  // Calcul sur (annee, mois) uniquement : setMonth sur la date complete
  // deborde pour les contrats demarrant les 29/30/31 (31 janv + 1 mois
  // = 3 mars), ce qui decale les versements OPCO et cree des mois a double
  // mensualite SOLUVIA. Meme convention que moisAbsoluFromRelatif
  // (lib/echeancier/calc.ts).
  const total = start.getFullYear() * 12 + start.getMonth() + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
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

  // Production SOLUVIA = commission (TTC = taux × NPEC, HT déduit /1.2) répartie
  // au prorata sur toute la durée du contrat, de date_debut au terme. Indépendant
  // de la facturation (qui dépend de la société émettrice et du moment d'émission).
  const totalSoluviaTtc = (npec * tauxCommissionPct) / 100;
  const totalSoluvia = ttcToHt(totalSoluviaTtc);
  const mensualite = round2(totalSoluvia / dureeMois);
  const soluvia: ScheduleEntry[] = [];
  for (let i = 0; i < dureeMois; i++) {
    soluvia.push({ month: addMonthsKey(start, i), amount: mensualite });
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
  /** Production SOLUVIA HT = commission (NPEC x taux / 100, puis / 1.2) prorata sur la durée */
  productionSoluvia: number;
  /** Sum of factures.montant_ht for the month */
  facture: number;
  /** Encaissé HT du mois (paiements TTC ramenés au prorata HT/TTC de chaque facture) */
  encaisse: number;
  /** Sum of factures.montant_ht with statut = 'en_retard' */
  en_retard: number;
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
  // Bornes COURTES 'YYYY-MM' : mois_concerne est un TEXT a formats mixtes
  // ('YYYY-MM' event-based, 'YYYY-MM-01' echeancier). Des bornes 'YYYY-MM-DD'
  // excluent lexicographiquement les factures 'YYYY-MM' du mois borne
  // ('2025-07' < '2025-07-01'). [firstKey, monthAfterLastKey) est correct
  // pour tous les formats.
  const firstKey = months[0]!.slice(0, 7);
  const lastKey = months[months.length - 1]!.slice(0, 7);
  const monthAfterLastKey = format(
    addMonths(new Date(lastKey + '-01T00:00:00'), 1),
    'yyyy-MM',
  );

  // Exclude clients demo (is_demo=true) et archives : leurs factures gonflent
  // les KPIs sans correspondre a de la production reelle. !inner force la
  // jointure cote SQL pour que le filtre s'applique reellement.
  // est_avoir=false exclut les avoirs y compris en brouillon (statut encore
  // 'a_emettre'), que .neq('statut','avoir') laissait passer en negatif.
  // fetchAllRows + .order('id') : PostgREST tronque silencieusement a
  // max_rows (1000) sans pagination.
  const [facturesRes, paiementsRes, contratsRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('factures')
        .select(
          'montant_ht, statut, mois_concerne, client:clients!inner(is_demo, archive)',
        )
        .gte('mois_concerne', firstKey)
        .lt('mois_concerne', monthAfterLastKey)
        .eq('est_avoir', false)
        .eq('client.is_demo', false)
        .eq('client.archive', false)
        .order('id')
        .range(from, to),
    ),

    fetchAllRows((from, to) =>
      supabase
        .from('paiements')
        .select(
          'montant, facture:factures!inner(mois_concerne, montant_ht, montant_ttc, client:clients!inner(is_demo, archive))',
        )
        .gte('facture.mois_concerne', firstKey)
        .lt('facture.mois_concerne', monthAfterLastKey)
        .eq('facture.client.is_demo', false)
        .eq('facture.client.archive', false)
        .order('id')
        .range(from, to),
    ),

    fetchAllRows((from, to) =>
      supabase
        .from('contrats')
        .select(
          'date_debut, duree_mois, npec_amount, projet:projets!inner(taux_commission, client:clients!inner(is_demo, archive))',
        )
        .eq('archive', false)
        .eq('projet.client.is_demo', false)
        .eq('projet.client.archive', false)
        .order('id')
        .range(from, to),
    ),
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
