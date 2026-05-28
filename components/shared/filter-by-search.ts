import { matchesSearch } from '@/lib/utils/search';

export function filterBySearch<T>(
  rows: T[],
  search: string,
  getHaystack: (row: T) => string,
): T[] {
  if (!search.trim()) return rows;
  return rows.filter((row) => matchesSearch(getHaystack(row), search));
}
