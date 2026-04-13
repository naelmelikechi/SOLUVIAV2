'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { format, parseISO, isToday, isWeekend } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { SaisieTemps } from '@/lib/queries/temps';
import { saveSaisieTemps } from '@/lib/actions/temps';
import { cn } from '@/lib/utils';
import { formatHeures } from '@/lib/utils/formatters';
import { MAX_HEURES_JOUR, DEBOUNCE_MS } from '@/lib/utils/constants';

interface TimeGridProps {
  weekDates: string[];
  initialSaisies: SaisieTemps[];
  onCellClick?: (projetId: string, date: string) => void;
  onSaveHours?: (projetId: string, date: string, heures: number) => void;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const ABSENCE_STYLES: Record<string, { bg: string; text: string }> = {
  conges: { bg: 'bg-[var(--orange-bg)]', text: 'text-[var(--warning)]' },
  maladie: { bg: 'bg-[var(--red-bg)]', text: 'text-[var(--destructive)]' },
  ferie: { bg: 'bg-[var(--gray-bg)]', text: 'text-[var(--gray)]' },
};

export function TimeGrid({
  weekDates,
  initialSaisies,
  onCellClick,
  onSaveHours,
}: TimeGridProps) {
  const [saisies, setSaisies] = useState<SaisieTemps[]>(initialSaisies);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  // Sync saisies when initialSaisies changes (week navigation)
  useEffect(() => {
    setSaisies(initialSaisies);
  }, [initialSaisies]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Calculate daily totals
  const dailyTotals = weekDates.map((date) =>
    saisies.reduce((sum, s) => sum + (s.heures[date] || 0), 0),
  );

  const weeklyTotal = dailyTotals.slice(0, 5).reduce((a, b) => a + b, 0);

  const handleCellChange = useCallback(
    (projetId: string, date: string, value: string) => {
      const parsed = parseTimeInput(value);
      if (parsed === null) return;

      setSaisies((prev) => {
        const updated = prev.map((s) => {
          if (s.projet_id !== projetId) return s;
          return {
            ...s,
            heures: { ...s.heures, [date]: parsed },
          };
        });

        // Check daily max
        const dayTotal = updated.reduce(
          (sum, s) => sum + (s.heures[date] || 0),
          0,
        );
        if (dayTotal > MAX_HEURES_JOUR) {
          toast.error(`Maximum ${MAX_HEURES_JOUR}h par jour dépassé`);
          return prev;
        }

        return updated;
      });

      // Notify parent of optimistic update
      onSaveHours?.(projetId, date, parsed);

      // Debounced server save
      const key = `${projetId}:${date}`;
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }
      debounceTimers.current[key] = setTimeout(async () => {
        delete debounceTimers.current[key];
        const result = await saveSaisieTemps(projetId, date, parsed);
        if (result.success) {
          toast.success('Sauvegardé', { duration: 1000 });
        } else {
          toast.error(result.error ?? 'Erreur lors de la sauvegarde');
        }
      }, DEBOUNCE_MS);
    },
    [onSaveHours],
  );

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-[var(--card-alt)]">
            <th className="text-muted-foreground min-w-[220px] px-3 py-2.5 text-left text-xs font-semibold tracking-wider uppercase">
              Projet
            </th>
            {weekDates.map((date, i) => {
              const d = parseISO(date);
              const weekend = isWeekend(d);
              const today = isToday(d);
              return (
                <th
                  key={date}
                  className={cn(
                    'text-muted-foreground w-[68px] px-1 py-2.5 text-center text-xs font-semibold tracking-wider uppercase',
                    weekend && 'bg-[var(--card-alt)]',
                    today && 'bg-[var(--primary-bg)]',
                  )}
                >
                  {DAY_LABELS[i]} {!weekend && format(d, 'd', { locale: fr })}
                </th>
              );
            })}
            <th className="text-muted-foreground w-[72px] px-2 py-2.5 text-center text-xs font-semibold tracking-wider uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {saisies.map((saisie) => {
            const absStyle = saisie.absence_type
              ? ABSENCE_STYLES[saisie.absence_type]
              : null;
            const rowTotal = weekDates
              .slice(0, 5)
              .reduce((sum, d) => sum + (saisie.heures[d] || 0), 0);

            return (
              <tr
                key={saisie.projet_id}
                className={cn(
                  'border-b border-[var(--border-light)]',
                  absStyle?.bg,
                )}
              >
                {/* Project label */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'font-mono text-xs font-bold',
                        absStyle?.text || 'text-primary',
                      )}
                    >
                      {saisie.projet_ref}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {saisie.projet_label}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {weekDates.map((date) => {
                  const d = parseISO(date);
                  const weekend = isWeekend(d);
                  const today = isToday(d);
                  const dayTotal = saisies.reduce(
                    (sum, s) => sum + (s.heures[date] || 0),
                    0,
                  );
                  const atMax = dayTotal >= MAX_HEURES_JOUR;
                  const cellValue = saisie.heures[date] || 0;
                  const disabled = weekend || (atMax && cellValue === 0);

                  return (
                    <td
                      key={date}
                      className={cn(
                        'px-1 py-1.5 text-center',
                        weekend && 'bg-[var(--card-alt)]',
                        today && 'bg-[var(--primary-bg)]',
                      )}
                    >
                      {weekend ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <input
                          type="text"
                          inputMode="decimal"
                          className={cn(
                            'w-[52px] rounded-md border bg-white px-1 py-1.5 text-center font-mono text-[13px] transition-colors outline-none',
                            'border-border focus:border-primary focus:ring-primary/15 focus:ring-2',
                            today &&
                              'border-primary shadow-[0_0_0_2px_rgba(22,163,74,0.15)]',
                            disabled && 'opacity-30',
                            absStyle && 'opacity-40',
                          )}
                          disabled={disabled}
                          defaultValue={cellValue > 0 ? String(cellValue) : ''}
                          placeholder="0"
                          onBlur={(e) =>
                            handleCellChange(
                              saisie.projet_id,
                              date,
                              e.target.value,
                            )
                          }
                          onClick={() => {
                            if (!saisie.est_absence && onCellClick) {
                              onCellClick(saisie.projet_id, date);
                            }
                          }}
                        />
                      )}
                    </td>
                  );
                })}

                {/* Row total */}
                <td className="text-primary px-2 py-1.5 text-center font-mono text-[13px] font-bold">
                  {rowTotal > 0 ? formatHeures(rowTotal) : '—'}
                </td>
              </tr>
            );
          })}

          {/* Daily totals row */}
          <tr className="bg-[var(--card-alt)] font-bold">
            <td className="px-3 py-2.5 text-sm">Total journalier</td>
            {weekDates.map((date, i) => {
              const weekend = i >= 5;
              const today = isToday(parseISO(date));
              const total = dailyTotals[i] ?? 0;
              return (
                <td
                  key={date}
                  className={cn(
                    'px-1 py-2.5 text-center font-mono text-[13px]',
                    weekend && 'bg-[var(--card-alt)]',
                    today && 'bg-[var(--primary-bg)]',
                    !weekend && total > 0 && 'text-primary',
                  )}
                >
                  {weekend ? '—' : total > 0 ? formatHeures(total) : '0h'}
                </td>
              );
            })}
            <td className="px-2 py-2.5 text-center">
              <span className="bg-primary inline-block rounded-full px-3.5 py-1 font-mono text-[13px] font-bold text-white">
                {formatHeures(weeklyTotal)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function parseTimeInput(value: string): number | null {
  if (!value || value.trim() === '') return 0;
  const trimmed = value.trim();

  // "1h30" format
  const hm = trimmed.match(/^(\d+)h(\d+)?$/);
  if (hm) {
    // Capture group 1 always exists when match succeeds for this pattern.
    const h = parseInt(hm[1]!, 10);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    return h + m / 60;
  }

  // "15m" format
  const mOnly = trimmed.match(/^(\d+)m$/);
  if (mOnly) {
    return parseInt(mOnly[1]!, 10) / 60;
  }

  // Numeric
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num >= 0 && num <= MAX_HEURES_JOUR) {
    return Math.round(num * 100) / 100;
  }

  return null;
}
