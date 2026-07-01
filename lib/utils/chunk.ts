/**
 * Decoupe `arr` en lots successifs d'au plus `size` elements, dans l'ordre.
 *
 * Pourquoi : certaines requetes (ex. delete PostgREST par PK) interpolent la
 * liste d'ids dans l'URL. Une liste geante depasse la limite de longueur d'URL
 * du serveur et fait echouer la requete. Chunker borne l'URL par lot.
 *
 * - Preserve l'ordre : la concatenation des lots redonne `arr`.
 * - `size <= 0` est une erreur de programmation (boucle infinie sinon).
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
