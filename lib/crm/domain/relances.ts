import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { parseDateOnly } from './dates';

export type RelanceLite = { date_echeance: string; fait: boolean };
export type Buckets<T> = {
  enRetard: T[];
  aujourdhui: T[];
  aVenir: T[];
  plusTard: T[];
};

/** Range les relances non faites en 4 paquets relatifs à `now`. À venir = J+1..J+7. */
export function bucketRelances<T extends RelanceLite>(
  relances: T[],
  now: Date,
): Buckets<T> {
  const today = startOfDay(now);
  const out: Buckets<T> = {
    enRetard: [],
    aujourdhui: [],
    aVenir: [],
    plusTard: [],
  };
  for (const rel of relances) {
    if (rel.fait) continue;
    const diff = differenceInCalendarDays(
      parseDateOnly(rel.date_echeance),
      today,
    );
    if (diff < 0) out.enRetard.push(rel);
    else if (diff === 0) out.aujourdhui.push(rel);
    else if (diff <= 7) out.aVenir.push(rel);
    else out.plusTard.push(rel);
  }
  return out;
}
