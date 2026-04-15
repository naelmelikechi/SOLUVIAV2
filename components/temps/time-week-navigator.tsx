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
  loading?: boolean;
}

export function TimeWeekNavigator({
  weekDates,
  onPrev,
  onNext,
  onToday,
  loading,
}: TimeWeekNavigatorProps) {
  // weekDates is always 7 entries (Mon-Sun) per TimeWeekNavigatorProps contract.
  const monday = parseISO(weekDates[0]!);
  const sunday = parseISO(weekDates[6]!);

  const rangeLabel = `${format(monday, 'd', { locale: fr })} - ${format(sunday, 'd MMMM yyyy', { locale: fr })}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-3">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrev}
        aria-label="Semaine précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-0 flex-1 text-center text-sm font-medium md:min-w-[220px] md:flex-none">
        {loading ? (
          <span className="text-muted-foreground animate-pulse">
            Chargement...
          </span>
        ) : (
          rangeLabel
        )}
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
