/** Retire la syntaxe markdown pour un extrait/lecture courte en texte brut. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // blocs code
    .replace(/`([^`]+)`/g, '$1') // code inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // liens → texte
    .replace(/^#{1,6}\s+/gm, '') // titres
    .replace(/^\s*[-*+]\s+/gm, '') // puces
    .replace(/^\s*\d+\.\s+/gm, '') // listes ordonnées
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // gras/emphase
    .replace(/[*>#]/g, ' ') // symboles résiduels (hors `_`, fréquent en texte normal : identifiants, refs)
    .replace(/\s+/g, ' ')
    .trim();
}

const ECHEANCE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
/** 'YYYY-MM-DD' → '26 juin 2026' (null → null). Parse en UTC pour éviter le décalage TZ. */
export function formatEcheance(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return ECHEANCE_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Initiales d'un responsable ('Leslie Gangemi' → 'LG'), null → '—'. */
export function missionInitials(name: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '—';
}
