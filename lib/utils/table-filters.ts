import type { FilterFn } from '@tanstack/react-table';
import { matchesSearch } from '@/lib/utils/search';

/**
 * filterFn polymorphe pour les colonnes data-table :
 * - Si filterValue est un string -> matchesSearch (accent + casse insensible)
 *   utilise par le popover de recherche du header
 * - Si filterValue est un array -> .includes() sur la cellule
 *   utilise par les multi-selects de la toolbar (FilterOption)
 *
 * Permet a une meme colonne d accepter les 2 modes (header search + toolbar).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const textFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  const cell = row.getValue(columnId);
  if (cell == null) return false;
  if (Array.isArray(filterValue)) {
    return filterValue.length === 0 || filterValue.includes(cell);
  }
  if (typeof filterValue === 'string') {
    return matchesSearch(String(cell), filterValue);
  }
  return false;
};
