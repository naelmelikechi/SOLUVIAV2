/**
 * Calcule les totaux d'une facture en mode "TTC inclus" :
 * la commission est exprimee TTC, on derive HT/TVA a rebours.
 *
 * Convention HEOL : montant_commissionne est TTC.
 *
 * Garantie d'arrondi : SUM(lignesHt) == totalHt exactement (rebalance du
 * dernier centime sur la derniere ligne). Indispensable pour la coherence
 * legale facture <-> lignes (Art. 242 nonies A CGI : "la base d'imposition,
 * pour chaque taux distinct" doit etre coherente avec la somme des lignes).
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
  const div = 1 + tauxTva / 100;
  // Travail en centimes entiers pour eviter la derive flottante.
  const lignesTtcCents = events.map((e) =>
    Math.round(e.montant_commissionne * 100),
  );
  const totalTtcCents = lignesTtcCents.reduce((s, c) => s + c, 0);
  const totalHtCents = Math.round(totalTtcCents / div);
  const montantTvaCents = totalTtcCents - totalHtCents;

  // HT par ligne arrondi independamment, puis rebalance du dernier centime
  // pour garantir SUM(lignesHt) === totalHt.
  const lignesHtCents = lignesTtcCents.map((ttc) => Math.round(ttc / div));
  if (lignesHtCents.length > 0) {
    const sum = lignesHtCents.reduce((s, c) => s + c, 0);
    const diff = totalHtCents - sum;
    if (diff !== 0) {
      lignesHtCents[lignesHtCents.length - 1]! += diff;
    }
  }

  return {
    totalTtc: totalTtcCents / 100,
    totalHt: totalHtCents / 100,
    montantTva: montantTvaCents / 100,
    lignesHt: lignesHtCents.map((c) => c / 100),
  };
}
