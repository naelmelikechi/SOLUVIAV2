/**
 * Helpers pour les projets internes (formation, intercontrat, support
 * transverse, dev outils, R&D, prise de poste). Ces projets sont marques
 * `est_interne = true` dans la table projets ; leurs saisies de temps
 * vivent dans saisies_temps comme du travail normal mais sont exclues
 * des calculs de production.
 */

export const CATEGORIES_INTERNES = [
  'formation',
  'intercontrat',
  'support_transverse',
  'dev_outils',
  'r_et_d',
  'prise_de_poste',
] as const;

export type CategorieInterne = (typeof CATEGORIES_INTERNES)[number];

const LABELS: Record<CategorieInterne, string> = {
  formation: 'Formation interne',
  intercontrat: 'Intercontrat',
  support_transverse: 'Support transverse',
  dev_outils: 'Dev outils internes',
  r_et_d: 'R&D / veille',
  prise_de_poste: 'Prise de poste',
};

export function getCategorieInterneLabel(
  categorie: string | null | undefined,
): string {
  if (!categorie) return '';
  return LABELS[categorie as CategorieInterne] ?? categorie;
}
