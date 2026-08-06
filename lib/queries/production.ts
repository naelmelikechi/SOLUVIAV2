import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import {
  getContratsActifs,
  getMonthSums,
} from '@/lib/queries/production-aggregates';
import { monthsBetween } from '@/lib/echeancier/calc';
import { commissionSoluviaHt } from '@/lib/utils/convention-commission';
import { round2 } from '@/lib/utils/number';
import { resolveTauxCommission } from '@/lib/utils/commission';
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
//
// RUPTURE (decision 2026-08-05) : un contrat rompu ne produit plus rien apres
// sa date de rupture. Les deux echeanciers sont tronques a cette date :
//   - SOLUVIA : mensualites pleines jusqu'au dernier mois complet, puis une
//     mensualite fractionnaire le mois de la rupture, puis plus rien. Le cumul
//     vaut donc commissionHt x (duree_realisee / duree), soit exactement le
//     "gagne" de computeProrataRupture (l'avoir prorata) - meme convention de
//     duree realisee (monthsBetween), pour que les deux chiffres se repondent.
//   - OPCO : total plafonne a NPEC x (duree_realisee / duree), servi sur les
//     jalons deja ouverts ; ce qui resterait du apres la rupture est regularise
//     sur le mois de la rupture plutot que verse a une date future.
// Un contrat rompu avant tout demarrage (duree realisee = 0, cas des ANNULE
// jamais commences) ne produit rien du tout.
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

/**
 * Fraction de contrat reellement realisee (0..1). 1 pour un contrat non rompu
 * ou dont la rupture tombe apres le terme. Sert a prorater tout montant assis
 * sur la duree du contrat (production OPCO de la fiche projet, notamment).
 */
export function fractionRealisee(
  dateDebutIso: string | null,
  dureeMois: number | null,
  dateRuptureIso: string | null | undefined,
): number {
  if (!dateRuptureIso || !dateDebutIso || !dureeMois || dureeMois <= 0)
    return 1;
  const realisee = Math.max(
    0,
    Math.min(dureeMois, monthsBetween(dateDebutIso, dateRuptureIso)),
  );
  return realisee / dureeMois;
}

export function computeContractSchedule(
  dateDebutIso: string,
  dureeMois: number,
  npec: number,
  tauxCommissionPct: number,
  /** Date de rupture ISO : tronque les deux echeanciers. null = contrat non rompu. */
  dateRuptureIso?: string | null,
): ContractSchedule {
  const start = new Date(dateDebutIso + 'T00:00:00');
  if (isNaN(start.getTime()) || dureeMois <= 0 || npec <= 0) {
    return { opco: [], soluvia: [] };
  }

  // Duree effectivement realisee. Sans rupture (cas courant) on reste sur le
  // chemin historique, au centime pres : aucune regression sur les contrats sains.
  const realiseeMois = dateRuptureIso
    ? Math.max(
        0,
        Math.min(dureeMois, monthsBetween(dateDebutIso, dateRuptureIso)),
      )
    : dureeMois;
  const tronque = realiseeMois < dureeMois;

  // Rompu avant tout demarrage : ni production SOLUVIA, ni versement OPCO.
  if (realiseeMois <= 0) return { opco: [], soluvia: [] };

  // Convention HT/TTC : source unique dans lib/utils/convention-commission.
  // Ce calcul appliquait `ttcToHt` sans distinguer le modele de facturation, ce
  // qui generalisait a tout le portefeuille une convention documentee comme
  // HEOL-specifique, alors que le chemin de FACTURATION lit la meme expression
  // comme du HT. Cf audit #122, constat 4 : la decision appartient aux contrats
  // de partenariat non-HEOL, pas au code. Le defaut preserve le comportement
  // actuel a l'identique, et la bascule se fait dans ce seul module.
  const totalSoluvia = commissionSoluviaHt(npec, tauxCommissionPct);
  const mensualite = round2(totalSoluvia / dureeMois);

  if (!tronque) {
    const opco: ScheduleEntry[] = [
      { month: addMonthsKey(start, 1), amount: round2(npec * 0.4) },
      { month: addMonthsKey(start, 7), amount: round2(npec * 0.3) },
      { month: addMonthsKey(start, 10), amount: round2(npec * 0.2) },
      { month: addMonthsKey(start, dureeMois + 1), amount: round2(npec * 0.1) },
    ];
    // Production SOLUVIA = commission (TTC = taux × NPEC, HT déduit /1.2) répartie
    // au prorata sur toute la durée du contrat, de date_debut au terme. Indépendant
    // de la facturation (qui dépend de la société émettrice et du moment d'émission).
    const soluvia: ScheduleEntry[] = [];
    for (let i = 0; i < dureeMois; i++) {
      soluvia.push({ month: addMonthsKey(start, i), amount: mensualite });
    }
    return { opco, soluvia };
  }

  // ── Contrat rompu : troncature a la date de rupture ────────────────────────
  const moisPleins = Math.floor(realiseeMois);
  const fraction = realiseeMois - moisPleins;
  const moisRupture = addMonthsKey(start, moisPleins);

  const soluvia: ScheduleEntry[] = [];
  for (let i = 0; i < moisPleins; i++) {
    soluvia.push({ month: addMonthsKey(start, i), amount: mensualite });
  }
  if (fraction > 0) {
    const partiel = round2(mensualite * fraction);
    if (partiel > 0) soluvia.push({ month: moisRupture, amount: partiel });
  }

  // OPCO : plafonne au NPEC realise. Les jalons posterieurs a la rupture sont
  // regularises sur le mois de rupture (l'OPCO ne verse plus au-dela).
  let reste = round2(npec * (realiseeMois / dureeMois));
  const opcoByMonth = new Map<string, number>();
  const jalons: [number, number][] = [
    [1, 0.4],
    [7, 0.3],
    [10, 0.2],
    [dureeMois + 1, 0.1],
  ];
  for (const [offset, pct] of jalons) {
    if (reste <= 0) break;
    const amount = Math.min(round2(npec * pct), reste);
    const month =
      offset > moisPleins ? moisRupture : addMonthsKey(start, offset);
    opcoByMonth.set(month, round2((opcoByMonth.get(month) ?? 0) + amount));
    reste = round2(reste - amount);
  }
  const opco: ScheduleEntry[] = [...opcoByMonth].map(([month, amount]) => ({
    month,
    amount,
  }));

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
  /** Equivalents TTC (montant_ttc factures = valeurs PDF, paiements bruts). */
  factureTtc: number;
  encaisseTtc: number;
  enRetardTtc: number;
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

  // Sommes factures/paiements et contrats actifs via le module partage
  // production-aggregates (RPC SQL cote base, fallback fetchAllRows) :
  // filtres demo/archive et exclusion est_avoir identiques a l'ancien trio
  // de requetes ligne a ligne.
  const [monthSums, contrats] = await Promise.all([
    getMonthSums(supabase, firstKey, monthAfterLastKey),
    getContratsActifs(supabase, firstKey, lastKey),
  ]);

  // ---------------------------------------------------------------------------
  // 1. Theoretical production per month (OPCO + SOLUVIA) from the new schedule
  // ---------------------------------------------------------------------------
  const productionByMonth = new Map<string, number>();
  const productionSoluviaByMonth = new Map<string, number>();

  for (const c of contrats) {
    if (!c.date_debut || !c.duree_mois || c.duree_mois <= 0) continue;
    if (!c.npec_amount || c.npec_amount <= 0) continue;

    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      resolveTauxCommission(c.taux_commission),
      c.date_rupture,
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
  // 2. Assemble 25 rows (sommes reelles facture/encaisse/retard via monthSums)
  // ---------------------------------------------------------------------------
  return months.map((mois) => {
    const key = mois.slice(0, 7);
    const sums = monthSums.get(key);
    const facture = round2(sums?.facture ?? 0);
    const en_retard = round2(sums?.en_retard ?? 0);
    const encaisse = round2(sums?.encaisse ?? 0);
    const factureTtc = round2(sums?.factureTtc ?? 0);
    const enRetardTtc = round2(sums?.enRetardTtc ?? 0);
    const encaisseTtc = round2(sums?.encaisseTtc ?? 0);
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
      factureTtc,
      encaisseTtc,
      enRetardTtc,
    };
  });
}
