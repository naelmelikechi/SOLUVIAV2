/**
 * Ventilation de la TVA par taux pour le PDF de facture.
 *
 * Pourquoi ce module existe : `factures.taux_tva` est un taux DERIVE. Le
 * trigger DB `recompute_facture_totaux` le recalcule en
 * `floor((tva / ht) * 100 * 100 + 0.5) / 100`, soit la moyenne ponderee des
 * taux des lignes. Sur une facture a taux mixtes (1 000 HT a 20 % plus 500 HT a
 * 0 %) il vaut 13,33 %, qui ne correspond a aucun taux legal francais.
 *
 * Appliquer ce taux derive a chaque ligne, comme le faisait le PDF, imprimait
 * la ligne A a 1 133,30 TTC au lieu de 1 200,00 et la ligne B a 566,65 au lieu
 * de 500,00, pour une somme de lignes qui ne retombait pas sur le total
 * d'en-tete, et une mention « TVA 13,33 % » inexistante en droit.
 *
 * L'article 242 nonies A du CGI impose la ventilation de la base d'imposition
 * par taux distinct : d'ou une ligne de total par taux des qu'il y en a
 * plusieurs.
 */

export interface LigneTva {
  montant_ht: number;
  /** Taux propre a la ligne, renseigne par la conversion devis en mode
   *  personnalisee. `null` = la ligne suit le taux d'en-tete. */
  taux_tva_ligne?: number | null;
}

export interface TvaParTaux {
  taux: number;
  tva: number;
}

/** TVA d'une ligne, arrondie au centime. */
export function tvaLigne(ligne: LigneTva, tauxEntete: number): number {
  const taux = Number(ligne.taux_tva_ligne ?? tauxEntete);
  return Math.round(ligne.montant_ht * (taux / 100) * 100) / 100;
}

/** TTC d'une ligne, au taux de la ligne et non au taux derive d'en-tete. */
export function ttcLigne(ligne: LigneTva, tauxEntete: number): number {
  const taux = Number(ligne.taux_tva_ligne ?? tauxEntete);
  return Math.round(ligne.montant_ht * (1 + taux / 100) * 100) / 100;
}

/**
 * Ventile la TVA par taux, du plus eleve au plus bas.
 *
 * Renvoie un seul element quand toutes les lignes partagent le meme taux : dans
 * ce cas l'appelant doit preferer `factures.montant_tva`, qui est la valeur de
 * reference calculee par la base.
 */
export function ventilerTvaParTaux(
  lignes: readonly LigneTva[],
  tauxEntete: number,
): TvaParTaux[] {
  const parTaux = new Map<number, number>();
  for (const l of lignes) {
    const taux = Number(l.taux_tva_ligne ?? tauxEntete);
    parTaux.set(taux, (parTaux.get(taux) ?? 0) + tvaLigne(l, tauxEntete));
  }
  return Array.from(parTaux.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([taux, tva]) => ({ taux, tva: Math.round(tva * 100) / 100 }));
}
