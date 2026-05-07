/**
 * Helpers de manipulation de dates ISO (`YYYY-MM-DD`) en UTC strict.
 *
 * Pourquoi : `new Date('2026-05-07T00:00:00')` est interprete en heure
 * locale, et `toISOString()` reconvertit en UTC, ce qui peut faire
 * basculer la date d'un jour selon le fuseau (ex. Europe/Paris UTC+2 en
 * ete : 2026-05-07 local = 2026-05-06 UTC).
 *
 * Ces helpers travaillent uniquement en UTC pour eviter ce piege.
 */

function parseUtcParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    !y ||
    !m ||
    !d
  ) {
    throw new Error(`Date ISO invalide: ${dateStr}`);
  }
  return [y, m, d];
}

/**
 * Soustrait `days` jours a une date ISO (`YYYY-MM-DD`), en UTC strict.
 * Retourne une nouvelle string ISO.
 */
export function subtractDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = parseUtcParts(dateStr);
  const result = new Date(Date.UTC(y, m - 1, d - days));
  return result.toISOString().split('T')[0]!;
}

/**
 * Ajoute `days` jours a une date ISO (`YYYY-MM-DD`), en UTC strict.
 */
export function addDaysIso(dateStr: string, days: number): string {
  return subtractDaysIso(dateStr, -days);
}
