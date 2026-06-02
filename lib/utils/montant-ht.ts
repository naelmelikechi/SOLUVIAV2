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
