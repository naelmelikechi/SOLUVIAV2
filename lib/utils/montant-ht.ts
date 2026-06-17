/**
 * Conversion encaissé TTC -> HT pour les KPIs dashboard.
 *
 * Les paiements ne stockent que le montant TTC réellement reçu (`paiements.montant`).
 * Pour afficher l'encaissé en HT de façon cohérente avec le facturé (montant_ht),
 * on applique le ratio HT/TTC de la facture concernée. Ce ratio vaut 1 pour les
 * factures intracom à TVA 0% (HT=TTC) et ~0.833 pour les commissions à 20%.
 */

/** Ratio HT/TTC d'une facture. Vaut 1 si TTC <= 0 (anomalie / facture 0€) pour ne perdre aucun encaissement. */
export function htRatio(montantHt: number, montantTtc: number): number {
  if (montantTtc <= 0) return 1;
  return montantHt / montantTtc;
}

/** Encaissé HT = paiements TTC × ratio HT/TTC de la facture. */
export function encaisseHt(
  paiementsTtc: number,
  montantHt: number,
  montantTtc: number,
): number {
  return paiementsTtc * htRatio(montantHt, montantTtc);
}

/** Taux de TVA standard (France métropole) appliqué aux commissions SOLUVIA. */
export const TVA_RATE = 0.2;

/**
 * Déduit le HT d'un montant TTC connu (TVA 20% par défaut).
 * Utilisé pour la production SOLUVIA théorique : la commission est définie en
 * TTC (taux × NPEC), on en déduit le HT pour l'affichage.
 */
export function ttcToHt(montantTtc: number, tvaRate = TVA_RATE): number {
  return montantTtc / (1 + tvaRate);
}

/**
 * Calcule le TTC à partir d'un HT et d'un taux de TVA (fraction, ex. 0,2 = 20 %).
 * Inverse de ttcToHt. Vaut le HT pour un taux 0 (régime intracom / autoliquidation).
 * L'arrondi d'affichage est délégué à formatCurrency.
 */
export function htToTtc(montantHt: number, tvaRate = TVA_RATE): number {
  return montantHt * (1 + tvaRate);
}
