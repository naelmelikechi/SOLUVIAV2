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

/**
 * Format une `Date` en `YYYY-MM-DD` selon le fuseau LOCAL.
 *
 * Pourquoi : `Date.prototype.toISOString()` renvoie l'UTC. En Europe/Paris
 * (UTC+1/+2), minuit local correspond a 22h-23h UTC la veille - donc
 * `new Date().toISOString().slice(0,10)` peut retourner la date d'hier
 * au lieu d'aujourd'hui. Ce helper reste en local et evite ce piege.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lundi de la semaine de `now`, en `YYYY-MM-DD` local. Sat/Sun pointent
 * sur le LUNDI PRECEDENT (semaine qu'on vient de finir cote utilisateur).
 * Sert au compte de jours travailles non saisis.
 */
export function currentMondayLocalISO(now: Date = new Date()): string {
  const day = now.getDay(); // 0 = Sun … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diff,
  );
  return toLocalISODate(monday);
}

/**
 * Vendredi de la semaine de `now`, en `YYYY-MM-DD` local. Voir doc de
 * `currentMondayLocalISO` pour la semantique Sat/Sun.
 */
export function currentFridayLocalISO(now: Date = new Date()): string {
  const day = now.getDay();
  const diff = day === 0 ? -2 : 5 - day;
  const friday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diff,
  );
  return toLocalISODate(friday);
}

/**
 * Nombre de jours calendaires entre deux dates ISO (`YYYY-MM-DD`), en UTC
 * strict : `toIso - fromIso`. Positif si `toIso` est posterieur. Sert a
 * deriver un delai ("reglement sous N jours") a partir des dates d'emission
 * et d'echeance d'une facture.
 */
export function diffDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = parseUtcParts(fromIso);
  const [ty, tm, td] = parseUtcParts(toIso);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Nombre de jours ouvrés (lun-ven) écoulés cette semaine, aujourd'hui inclus.
 * Samedi/dimanche -> 5 (semaine pleine). Sert au compte de jours travaillés
 * non saisis (badge sidebar + worklist accueil).
 */
export function businessDaysElapsedThisWeek(now: Date = new Date()): number {
  const day = now.getDay(); // 0 = Sun … 6 = Sat
  if (day === 0 || day === 6) return 5;
  return day; // Mon=1 … Fri=5
}
