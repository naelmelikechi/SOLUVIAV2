import { format } from 'date-fns';
import type { ProductionRow } from '@/lib/queries/production';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthRow {
  mois: string;
  date: Date;
  label: string;
  production: number;
  facture: number;
  encaisse: number;
  en_retard: number;
  raf: number;
  rae: number;
  rolling12: number;
  ytd: number;
  isFuture: boolean;
  isCurrent: boolean;
}

// ---------------------------------------------------------------------------
// Pure helper - no React, no JSX
// ---------------------------------------------------------------------------

export function buildDisplayData(
  data: ProductionRow[],
  perspective: 'opco' | 'soluvia',
): MonthRow[] {
  const isSoluvia = perspective === 'soluvia';
  const today = new Date();
  const currentKey = format(today, 'yyyy-MM');

  const rows: Omit<MonthRow, 'raf' | 'rae' | 'rolling12' | 'ytd'>[] = data.map(
    (row) => {
      const d = new Date(row.mois + 'T00:00:00');
      const monthKey = row.mois.slice(0, 7);
      const isFuture = monthKey > currentKey;
      const isCurrent = monthKey === currentKey;

      // For SOLUVIA perspective, scale facture/encaisse/retard by the average
      // commission ratio derived from the schedule (productionSoluvia / production)
      const ratio =
        row.production > 0 ? row.productionSoluvia / row.production : 0;
      const commission = isSoluvia ? ratio : 1;

      return {
        mois: row.mois,
        date: d,
        label: row.label,
        production: isSoluvia
          ? Math.round(row.productionSoluvia)
          : Math.round(row.production),
        facture: Math.round(row.facture * commission),
        encaisse: Math.round(row.encaisse * commission),
        en_retard: Math.round(row.en_retard * commission),
        isFuture,
        isCurrent,
      };
    },
  );

  let cumulProduction = 0;
  let cumulFacture = 0;
  let cumulEncaisse = 0;

  return rows.map((row, idx) => {
    cumulProduction += row.production;
    cumulFacture += row.facture;
    cumulEncaisse += row.encaisse;

    let rolling12 = 0;
    for (let i = Math.max(0, idx - 11); i <= idx; i++) {
      rolling12 += rows[i]!.production;
    }

    const rowYear = row.date.getFullYear();
    let ytd = 0;
    for (let i = 0; i <= idx; i++) {
      if (rows[i]!.date.getFullYear() === rowYear) {
        ytd += rows[i]!.production;
      }
    }

    return {
      ...row,
      raf: cumulProduction - cumulFacture,
      rae: cumulFacture - cumulEncaisse,
      rolling12,
      ytd,
    };
  });
}
