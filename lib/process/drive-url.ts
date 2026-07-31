// Module pur : aucune dépendance serveur (pas de google-auth-library, pas de
// lib/env, pas de supabase). Safe à importer depuis un composant client.

const FILE_ID_RE =
  /\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/;
const OPEN_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)/;

/** Extrait l'ID d'un fichier Drive depuis une URL, ou null (dossier / non-Drive). */
export function extractDriveFileId(url: string): string | null {
  if (!/drive\.google\.com|docs\.google\.com/.test(url)) return null;
  if (/\/folders\//.test(url)) return null;
  const m = url.match(FILE_ID_RE) ?? url.match(OPEN_ID_RE);
  return m?.[1] ?? null;
}
