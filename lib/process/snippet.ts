/**
 * Construit un extrait lisible du contenu, centré si possible autour du
 * premier terme de la requête présent dans le texte.
 */
export function buildSnippet(
  contenu: string,
  query: string,
  maxLen = 200,
): string {
  const clean = contenu.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = clean.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    const found = lower.indexOf(t);
    if (found !== -1) {
      idx = found;
      break;
    }
  }

  if (idx === -1) {
    return clean.slice(0, maxLen).trimEnd() + '…';
  }

  const start = Math.max(0, idx - Math.floor(maxLen / 3));
  const slice = clean.slice(start, start + maxLen).trimEnd();
  const prefix = start > 0 ? '…' : '';
  return prefix + slice + '…';
}
