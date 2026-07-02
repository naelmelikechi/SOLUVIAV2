/**
 * Pagination exhaustive pour les agregats.
 *
 * PostgREST plafonne chaque reponse a max_rows (1000 par defaut sur Supavia) :
 * un .select() sans .range() est silencieusement tronque au-dela, sans erreur.
 * Ce helper boucle par pages jusqu'a epuisement.
 *
 * Le builder DOIT inclure un .order() stable (ex. .order('id')) : sans ordre
 * deterministe, les pages peuvent se chevaucher ou sauter des lignes.
 */
export async function fetchAllRows<T>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: rows, error: null };
}
