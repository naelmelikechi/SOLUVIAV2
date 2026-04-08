'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TimeWeekNavigatorProps {
  weekDates: string[]; // 7 ISO dates (Mon-Sun)
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function TimeWeekNavigator({
  weekDates,
  onPrev,
  onNext,
  onToday,
}: TimeWeekNavigatorProps) {
  const monday = parseISO(weekDates[0]);
  const sunday = parseISO(weekDates[6]);

  const rangeLabel = `${format(monday, 'd', { locale: fr })} — ${format(sunday, 'd MMMM yyyy', { locale: fr })}`;

  return (
    <div className="mb-4 flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrev}
        aria-label="Semaine précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[220px] text-center text-sm font-medium">
        {rangeLabel}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={onNext}
        aria-label="Semaine suivante"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" onClick={onToday}>
        Aujourd&apos;hui
      </Button>
    </div>
  );
}
