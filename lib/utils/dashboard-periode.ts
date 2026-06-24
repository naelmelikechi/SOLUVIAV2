import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { capitalize } from '@/lib/utils/strings';

export type PeriodeKey = 'ce_mois' | 'mois_precedent' | '30j';

export interface Periode {
  key: PeriodeKey;
  /** UTC-midnight Date (time component is 00:00:00.000Z). */
  from: Date;
  /** UTC-midnight Date (time component is 00:00:00.000Z). */
  to: Date;
  label: string;
}

function utcStartOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function utcEndOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

/**
 * Returns a `Periode` whose `from` and `to` are **UTC-midnight** Date objects
 * (i.e. `time === 00:00:00.000Z`). To produce a `yyyy-MM-dd` string for DB
 * queries, use `date.toISOString().slice(0, 10)` — NOT `date-fns format()`,
 * which interprets the Date in the local timezone and may shift the day.
 */
export function resolvePeriode(
  key: PeriodeKey,
  ref: Date = new Date(),
): Periode {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();

  switch (key) {
    case 'mois_precedent': {
      const prevYear = m === 0 ? y - 1 : y;
      const prevMonth = m === 0 ? 11 : m - 1;
      const from = utcStartOfMonth(prevYear, prevMonth);
      return {
        key: 'mois_precedent',
        from,
        to: utcEndOfMonth(prevYear, prevMonth),
        label: capitalize(format(from, 'MMMM yyyy', { locale: fr })),
      };
    }
    case '30j': {
      const to = new Date(Date.UTC(y, m, ref.getUTCDate()));
      const from = new Date(Date.UTC(y, m, ref.getUTCDate() - 30));
      return { key: '30j', from, to, label: '30 derniers jours' };
    }
    case 'ce_mois':
    default: {
      const from = utcStartOfMonth(y, m);
      return {
        key: 'ce_mois',
        from,
        to: utcEndOfMonth(y, m),
        label: capitalize(format(from, 'MMMM yyyy', { locale: fr })),
      };
    }
  }
}
