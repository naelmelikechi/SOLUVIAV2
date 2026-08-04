/**
 * Netting des avoirs sur les agregats de facturation.
 *
 * Convention DB : un avoir est une ligne de `factures` avec est_avoir=true,
 * montant_ht NEGATIF, liee a sa facture d'origine par facture_origine_id.
 * La facture d'origine ne change JAMAIS de statut a l'emission d'un avoir
 * (pas de statut 'annulee') : une facture integralement soldee par avoir
 * reste 'emise' ou 'en_retard' en base.
 *
 * Regle metier unique (audit totaux 2026-08-04) :
 *  - "Facture" = somme nette, avoirs emis inclus (negatifs), brouillons exclus.
 *  - "En retard" / "En attente" = solde restant du = montant + avoirs lies
 *    (clampe a 0) ; une facture totalement soldee par avoir sort des retards,
 *    des relances et des compteurs.
 * Seuls les avoirs EMIS (statut 'avoir') comptent : un brouillon d'avoir
 * (statut 'a_emettre') n'a pas d'existence legale.
 */

export interface AvoirLie {
  montant_ht: number | null;
  statut: string;
}

/** Somme (negative ou 0) des avoirs emis d'une liste d'avoirs lies. */
export function sumAvoirsEmis(avoirs: AvoirLie[] | null | undefined): number {
  return (avoirs ?? [])
    .filter((a) => a.statut === 'avoir')
    .reduce((s, a) => s + (a.montant_ht ?? 0), 0);
}

/**
 * Solde HT restant du d'une facture apres deduction des avoirs emis lies.
 * Clampe a 0 : un avoir superieur au restant ne cree pas de solde negatif.
 */
export function soldeNetHt(
  montantHt: number | null | undefined,
  avoirs: AvoirLie[] | null | undefined,
): number {
  return Math.max(0, (montantHt ?? 0) + sumAvoirsEmis(avoirs));
}
