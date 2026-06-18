// Mentions legales de la reforme e-invoicing 2026. SOLUVIA ne facture que des
// prestations de services -> categorie d'operation fixe. La mention "debits"
// depend d'une option fiscale par societe emettrice (tva_sur_debits).
// Apostrophes droites + pas d'em-dash : la Helvetica embarquee de @react-pdf
// ne gere pas tous les caracteres speciaux, et c'est une convention projet.

export const CATEGORIE_OPERATION_SERVICES =
  "Categorie d'operation : Prestations de services";

export const TVA_DEBITS_MENTION =
  "Option pour le paiement de la taxe d'apres les debits";

export function buildEInvoicingMentions(opts: {
  tvaSurDebits?: boolean | null;
}): string[] {
  const mentions = [CATEGORIE_OPERATION_SERVICES];
  if (opts.tvaSurDebits) mentions.push(TVA_DEBITS_MENTION);
  return mentions;
}

export function buildOdooNarration(opts: {
  tvaSurDebits?: boolean | null;
}): string {
  return buildEInvoicingMentions(opts).join('\n');
}
