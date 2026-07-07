import { parseISO, startOfDay } from 'date-fns';

/** Fuseau de référence de l'app (saisie et affichage des dates). */
export const TZ = 'Europe/Paris';

/** Parse une date "YYYY-MM-DD" en Date locale au début de journée. */
export function parseDateOnly(s: string): Date {
  return startOfDay(parseISO(s));
}

/**
 * Formate une Date arbitraire en "YYYY-MM-DD" dans le fuseau Europe/Paris.
 * Source unique (avant : copies dans lib/format.ts et lib/domain/recap.ts).
 * en-CA produit le format ISO court "YYYY-MM-DD".
 */
export function parisDateOnly(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
