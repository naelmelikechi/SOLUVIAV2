/**
 * Normalize a string for search: lowercase, strip diacritics (accents),
 * collapse whitespace. Used for accent-insensitive and case-insensitive
 * matching across data tables.
 */
export function normalizeForSearch(value: unknown): string {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if `haystack` contains all tokens from `needle`
 * (space-separated, accent-insensitive, case-insensitive).
 */
export function matchesSearch(haystack: unknown, needle: string): boolean {
  const normalizedNeedle = normalizeForSearch(needle);
  if (!normalizedNeedle) return true;
  const normalizedHay = normalizeForSearch(haystack);
  const tokens = normalizedNeedle.split(' ').filter(Boolean);
  return tokens.every((t) => normalizedHay.includes(t));
}
