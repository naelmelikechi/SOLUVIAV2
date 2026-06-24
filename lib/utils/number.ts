/**
 * Arrondi a 2 decimales (centimes entiers), source unique pour toute l'app.
 *
 * Evite les artefacts de flottants (0.1 + 0.2 = 0.30000000000000004) sur les
 * montants HT/TVA/TTC et les jalons d'echeancier. Invariant facturation legale :
 * les montants sont stockes/calcules en centimes entiers (cf. CLAUDE.md).
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
