/**
 * Helpers chaine partages (source unique pour eviter les copies locales).
 */

/** Capitalise la premiere lettre. Labels FR : "mai 2026" -> "Mai 2026". */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Nettoie un nom de fichier pour une cle de stockage : tout caractere hors
 * [\w.-] devient "_", tronque a 120 caracteres, et garantit un nom non vide
 * via `fallback`.
 */
export function sanitizeFileName(name: string, fallback = 'document'): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || fallback;
}
