import { parseISO, startOfDay } from 'date-fns';

// Source unique du fuseau de référence et des conversions date-only Paris
// (ex lib/crm/domain/dates.ts, promu module partagé lors de la fusion des
// formatters CRM).

/** Fuseau de référence de l'app (saisie et affichage des dates). */
export const TZ = 'Europe/Paris';

/** Parse une date "YYYY-MM-DD" en Date locale au début de journée. */
export function parseDateOnly(s: string): Date {
  return startOfDay(parseISO(s));
}

/**
 * Formate une Date arbitraire en "YYYY-MM-DD" dans le fuseau Europe/Paris.
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
