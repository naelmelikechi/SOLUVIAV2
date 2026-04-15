'use client';

import { useState, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import type { EcheancePending } from '@/lib/queries/factures';

interface EcheanceCalendarProps {
  echeances: EcheancePending[];
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function EcheanceCalendar({ echeances }: EcheanceCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Group echeances by date_emission_prevue
  const echeancesByDate = useMemo(() => {
    const map = new Map<string, EcheancePending[]>();
    for (const e of echeances) {
      if (!e.date_emission_prevue) continue;
      const key = e.date_emission_prevue;
      const existing = map.get(key) ?? [];
      existing.push(e);
      map.set(key, existing);
    }
    return map;
  }, [echeances]);

  // Build calendar grid (6 weeks max)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Echeances for selected date
  const selectedEcheances = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return echeancesByDate.get(key) ?? [];
  }, [selectedDate, echeancesByDate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {/* Month navigation header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-sm font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-muted-foreground py-2 text-center text-xs font-medium"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEcheances = echeancesByDate.get(dateKey);
              const count = dayEcheances?.length ?? 0;
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);
              const selected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'hover:bg-muted/50 relative flex h-14 flex-col items-center justify-start border-r border-b p-1 text-xs transition-colors',
                    !inMonth && 'text-muted-foreground/40',
                    selected && 'bg-primary/10 ring-primary ring-1 ring-inset',
                    today && !selected && 'bg-muted/30',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      today && 'bg-primary font-bold text-white',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {count > 0 && (
                    <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDate && (
        <Card>
          <CardContent>
            <h4 className="mb-3 text-sm font-semibold">
              {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
            </h4>
            {selectedEcheances.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune échéance prévue ce jour.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedEcheances.map((e) => (
                  <div
                    key={e.id}
                    className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {e.projet?.ref ?? '-'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {e.projet?.client?.raison_sociale ?? '-'}
                        {e.mois_concerne && ` - ${e.mois_concerne}`}
                      </div>
                    </div>
                    <div className="pl-3 text-sm font-semibold whitespace-nowrap">
                      {formatCurrency(e.montant_prevu_ht)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
