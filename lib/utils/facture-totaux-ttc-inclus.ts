/**
 * Calcule les totaux d'une facture en mode "TTC inclus" :
 * la commission est exprimee TTC, on derive HT/TVA a rebours.
 *
 * Convention HEOL (billing_mode='manual') : montant_commissionne est TTC.
 *
 * Note arrondi : totalHt est calculé directement depuis totalTtc (single
 * rounding), tandis que lignesHt arrondit chaque ligne individuellement.
 * SUM(lignesHt) peut donc différer de totalHt de ±1 centime par tranche
 * d'arrondi. Les rapports doivent tolérer cet écart (cf. test "ecart d arrondi").
 */
export function computeFactureTotauxTtcInclus(
  events: { montant_commissionne: number }[],
  tauxTva: number,
): {
  totalTtc: number;
  totalHt: number;
  montantTva: number;
  lignesHt: number[];
} {
  const totalTtc =
    Math.round(events.reduce((s, e) => s + e.montant_commissionne, 0) * 100) /
    100;
  const totalHt = Math.round((totalTtc / (1 + tauxTva / 100)) * 100) / 100;
  const montantTva = Math.round((totalTtc - totalHt) * 100) / 100;
  const lignesHt = events.map(
    (e) =>
      Math.round((e.montant_commissionne / (1 + tauxTva / 100)) * 100) / 100,
  );
  return { totalTtc, totalHt, montantTva, lignesHt };
}
