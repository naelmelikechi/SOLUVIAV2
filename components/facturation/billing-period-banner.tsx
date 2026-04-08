'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  FENETRE_FACTURATION_DEBUT,
  FENETRE_FACTURATION_FIN,
} from '@/lib/utils/constants';

function getBillingPeriodInfo(today: Date) {
  const day = today.getDate();
  const month = today.getMonth();
  const year = today.getFullYear();

  if (day >= FENETRE_FACTURATION_DEBUT) {
    // We are between the 25th and end of month
    const start = new Date(year, month, FENETRE_FACTURATION_DEBUT);
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const end = new Date(nextYear, nextMonth, FENETRE_FACTURATION_FIN);
    return { inPeriod: true, start, end };
  }

  if (day <= FENETRE_FACTURATION_FIN) {
    // We are between the 1st and 3rd of the month
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const start = new Date(prevYear, prevMonth, FENETRE_FACTURATION_DEBUT);
    const end = new Date(year, month, FENETRE_FACTURATION_FIN);
    return { inPeriod: true, start, end };
  }

  return { inPeriod: false, start: null, end: null };
}

export function BillingPeriodBanner() {
  const { inPeriod, start, end } = useMemo(
    () => getBillingPeriodInfo(new Date()),
    [],
  );

  if (inPeriod && start && end) {
    const startLabel = `${FENETRE_FACTURATION_DEBUT} ${format(start, 'MMMM', { locale: fr })}`;
    const endLabel = `${FENETRE_FACTURATION_FIN} ${format(end, 'MMMM', { locale: fr })}`;

    return (
      <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-bg)] px-4 py-3">
        <p className="text-primary text-sm font-medium">
          Période de facturation en cours ({startLabel} — {endLabel})
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--warning)]/20 bg-[var(--orange-bg)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--warning)]">
        Hors période de facturation. Vous pouvez tout de même facturer.
      </p>
    </div>
  );
}
