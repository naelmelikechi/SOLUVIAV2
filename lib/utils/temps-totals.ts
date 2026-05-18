// lib/utils/temps-totals.ts
// Helpers de calcul des totaux affiches sur la grille de temps.
// Centralises ici pour pouvoir les unit-tester independamment de React.

import { MAX_HEURES_JOUR } from '@/lib/utils/constants';

type SaisieLike = { projet_id: string; heures: Record<string, number> };

export interface WeekTotalsInput {
  /** 7 dates Mon..Sun (ou au moins les 5 premieres = ouvres) */
  weekDates: string[];
  saisies: SaisieLike[];
  /** date ISO -> nb heures absence (3.5 demi / 7 plein) */
  absences: Record<string, number>;
  /** date ISO -> libelle ferie (presence = ferie) */
  joursFeries: Record<string, string>;
}

/**
 * Un jour est "pleinement bloque" (cellule UI cachee, "-" affiche) quand:
 * - c est un jour ferie, OU
 * - une absence pleine (>= 7h) le couvre.
 * Les heures projet existant sur un jour bloque sont des donnees zombies
 * (ex. saisie effectuee avant qu un conge soit pose) qui ne doivent pas
 * etre comptees dans les totaux affiches.
 */
export function isFullyBlocked(
  date: string,
  absences: Record<string, number>,
  joursFeries: Record<string, string>,
): boolean {
  if (joursFeries[date]) return true;
  if ((absences[date] || 0) >= 7) return true;
  return false;
}

/** Total des heures projet sur la ligne `saisie`, en ignorant les jours bloques. */
export function computeRowTotal(
  saisie: SaisieLike,
  weekDates: string[],
  absences: Record<string, number>,
  joursFeries: Record<string, string>,
): number {
  return weekDates
    .slice(0, 5)
    .reduce(
      (sum, d) =>
        sum +
        (isFullyBlocked(d, absences, joursFeries) ? 0 : saisie.heures[d] || 0),
      0,
    );
}

/** Total journalier (heures projet uniquement, hors absences). */
export function computeDailyProjectTotal(
  date: string,
  saisies: SaisieLike[],
  absences: Record<string, number>,
  joursFeries: Record<string, string>,
): number {
  if (isFullyBlocked(date, absences, joursFeries)) return 0;
  return saisies.reduce((sum, s) => sum + (s.heures[date] || 0), 0);
}

/**
 * Total semaine = heures projet sur jours non bloques + heures d absence
 * (les absences sont comptees independamment, qu elles soient demi ou plein,
 *  car elles sont au format "heures d activite non productive").
 */
export function computeWeekTotal({
  weekDates,
  saisies,
  absences,
  joursFeries,
}: WeekTotalsInput): number {
  const weekdays = weekDates.slice(0, 5);
  const absenceTotal = weekdays.reduce((sum, d) => sum + (absences[d] || 0), 0);
  const projectTotal = weekdays
    .filter((d) => !isFullyBlocked(d, absences, joursFeries))
    .reduce(
      (sum, d) => sum + saisies.reduce((s, sa) => s + (sa.heures[d] || 0), 0),
      0,
    );
  return projectTotal + absenceTotal;
}

/** Plafond hebdomadaire = (nb jours ouvres - nb jours feries) * MAX_HEURES_JOUR */
export function computeWeeklyMax(
  weekDates: string[],
  joursFeries: Record<string, string>,
): number {
  const workingDays = weekDates
    .slice(0, 5)
    .filter((d) => !joursFeries[d]).length;
  return workingDays * MAX_HEURES_JOUR;
}
