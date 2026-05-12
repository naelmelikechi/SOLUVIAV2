import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export type PeriodeKey = 'ce_mois' | 'mois_precedent' | '30j';

export interface Periode {
  key: PeriodeKey;
  from: Date;
  to: Date;
  label: string;
}

function utcStartOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function utcEndOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
