// Formatage monetaire partage des PDFs devis + factures.

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

/**
 * Formate un montant en euros pour @react-pdf/renderer.
 *
 * La police Helvetica embarquee ne contient pas le NNBSP (U+202F) que
 * Intl.NumberFormat fr-FR utilise comme separateur de milliers - il est rendu
 * en glyphe fallback ressemblant a un slash ("3/132,00 €" au lieu de
 * "3 132,00 €"). Idem pour le NBSP (U+00A0) avant le €. On normalise tout
 * espace en espace ASCII.
 */
export function formatEur(n: number | null | undefined): string {
  if (n == null) return '0,00 EUR';
  return eurFormatter.format(n).replace(/\s/g, ' ');
}
