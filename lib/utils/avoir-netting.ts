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

/**
 * Forme de l'embed PostgREST `avoirs:factures!facture_origine_id(...)`.
 * Runtime : toujours un tableau (relation one-to-many, verifie en prod).
 * Types generes supabase-js : inferent a tort un objet simple sur cette
 * relation self-referentielle via hint colonne - on accepte donc les deux
 * formes et on normalise.
 */
export type AvoirsEmbed = AvoirLie[] | AvoirLie | null | undefined;

/** Normalise l'embed avoirs en tableau. */
export function toAvoirList(avoirs: AvoirsEmbed): AvoirLie[] {
  if (!avoirs) return [];
  return Array.isArray(avoirs) ? avoirs : [avoirs];
}

/** Somme (negative ou 0) des avoirs emis d'une liste d'avoirs lies. */
export function sumAvoirsEmis(avoirs: AvoirsEmbed): number {
  return toAvoirList(avoirs)
    .filter((a) => a.statut === 'avoir')
    .reduce((s, a) => s + (a.montant_ht ?? 0), 0);
}

/**
 * Solde HT restant du d'une facture apres deduction des avoirs emis lies.
 * Clampe a 0 : un avoir superieur au restant ne cree pas de solde negatif.
 */
export function soldeNetHt(
  montantHt: number | null | undefined,
  avoirs: AvoirsEmbed,
): number {
  return Math.max(0, (montantHt ?? 0) + sumAvoirsEmis(avoirs));
}

/**
 * Variante TTC de soldeNetHt : meme netting sur les montants TTC PDF
 * (factures.montant_ttc, la valeur imprimee sur les factures - jamais un
 * x1,2 recalcule, pour rester au centime des PDF y compris TVA 0%).
 */
export interface AvoirLieTtc {
  montant_ttc: number | null;
  statut: string;
}

export type AvoirsTtcEmbed = AvoirLieTtc[] | AvoirLieTtc | null | undefined;

export function soldeNetTtc(
  montantTtc: number | null | undefined,
  avoirs: AvoirsTtcEmbed,
): number {
  const list = !avoirs ? [] : Array.isArray(avoirs) ? avoirs : [avoirs];
  const credit = list
    .filter((a) => a.statut === 'avoir')
    .reduce((s, a) => s + (a.montant_ttc ?? 0), 0);
  return Math.max(0, (montantTtc ?? 0) + credit);
}

/**
 * Etat d'annulation d'une facture vis-a-vis de ses avoirs emis :
 *  - 'totale'    : avoirs >= montant (solde 0, plus rien du)
 *  - 'partielle' : avoirs partiels (solde reduit mais > 0)
 *  - null        : aucun avoir emis
 * Tolerance 0,5 centime : les montants viennent de numeric PostgREST.
 */
export function avoirAnnulation(
  montantHt: number | null | undefined,
  avoirs: AvoirsEmbed,
): 'totale' | 'partielle' | null {
  const credit = sumAvoirsEmis(avoirs);
  if (credit >= -0.005) return null;
  return (montantHt ?? 0) + credit <= 0.005 ? 'totale' : 'partielle';
}
