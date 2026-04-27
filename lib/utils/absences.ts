// lib/utils/absences.ts
import { parseISO, isBefore, isAfter, isEqual } from 'date-fns';

export type AbsenceType = 'conges' | 'maladie';

export interface AbsencePeriod {
  id: string;
  type: AbsenceType;
  date_debut: string; // yyyy-MM-dd
  date_fin: string; // yyyy-MM-dd
  demi_jour_debut: boolean;
  demi_jour_fin: boolean;
}

export interface AbsenceDayInfo {
  type: AbsenceType;
  hours: number;
  absence_id: string;
}

const FULL_DAY_HOURS = 7;
const HALF_DAY_HOURS = 3.5;

/**
 * Calcule les heures d absence par jour pour un ensemble de dates.
 *
 * Retourne un Record dont la cle est la date (yyyy-MM-dd) et la valeur
 * decrit le type, le nombre d heures (3.5 si demi-journee de bord, sinon 7),
 * et l id de l absence concernee.
 *
 * Une absence couvre une date si date_debut <= date <= date_fin.
 * Demi-journee de bord :
 * - date == date_debut ET demi_jour_debut == true → 3.5h (apres-midi)
 * - date == date_fin ET demi_jour_fin == true → 3.5h (matin)
 * Si une seule date est dans la periode et qu un seul des deux flags est true,
 * cette date est une demi-journee.
 */
export function computeAbsenceHoursPerDay(
  absences: AbsencePeriod[],
  dates: string[],
): Record<string, AbsenceDayInfo> {
  const result: Record<string, AbsenceDayInfo> = {};

  for (const date of dates) {
    const d = parseISO(date);
    for (const a of absences) {
      const start = parseISO(a.date_debut);
      const end = parseISO(a.date_fin);
      const inRange =
        (isEqual(d, start) || isAfter(d, start)) &&
        (isEqual(d, end) || isBefore(d, end));
      if (!inRange) continue;

      const isStartDay = isEqual(d, start);
      const isEndDay = isEqual(d, end);
      let hours = FULL_DAY_HOURS;
      if (isStartDay && a.demi_jour_debut) hours = HALF_DAY_HOURS;
      if (isEndDay && a.demi_jour_fin) hours = HALF_DAY_HOURS;

      result[date] = { type: a.type, hours, absence_id: a.id };
      break; // une absence max par jour (garanti par la validation chevauchement)
    }
  }

  return result;
}

/**
 * Total d heures d une periode d absence (pour preview dans le formulaire).
 * Compte uniquement les jours ouvres (lundi-vendredi).
 */
export function computeAbsenceTotalHours(
  date_debut: string,
  date_fin: string,
  demi_jour_debut: boolean,
  demi_jour_fin: boolean,
): { jours: number; heures: number } {
  const start = parseISO(date_debut);
  const end = parseISO(date_fin);
  let jours = 0;
  let heures = 0;
  const cur = new Date(start);
  while (!isAfter(cur, end)) {
    const day = cur.getDay(); // 0 = sun, 6 = sat
    if (day !== 0 && day !== 6) {
      jours += 1;
      const isStart = isEqual(cur, start);
      const isEnd = isEqual(cur, end);
      let h = FULL_DAY_HOURS;
      if (isStart && demi_jour_debut) h = HALF_DAY_HOURS;
      if (isEnd && demi_jour_fin) h = HALF_DAY_HOURS;
      heures += h;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { jours, heures };
}
