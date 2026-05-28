'use client';

import { useState, useRef, useEffect } from 'react';
import { format, parseISO, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SaisieTemps } from '@/lib/queries/temps';
import { saveSaisieTemps } from '@/lib/actions/temps';
import { cn } from '@/lib/utils';
import { formatHeures } from '@/lib/utils/formatters';
import { MAX_HEURES_JOUR, DEBOUNCE_MS } from '@/lib/utils/constants';
import {
  computeDailyProjectTotal,
  computeRowTotal,
  computeWeekTotal,
  computeWeeklyMax,
} from '@/lib/utils/temps-totals';
import {
  useColumnWidths,
  ResizeHandle,
} from '@/components/temps/use-column-widths';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TimeGridProps {
  weekDates: string[];
  initialSaisies: SaisieTemps[];
  onCellClick?: (projetId: string, date: string) => void;
  onSaveHours?: (projetId: string, date: string, heures: number) => void;
  joursFeries?: Record<string, string>;
  /** date -> absence hours (from the absence banner). Full day = 7, half = 3.5 */
  absences?: Record<string, number>;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
const EMPTY_JOURS_FERIES: Record<string, string> = {};
const EMPTY_ABSENCES: Record<string, number> = {};

// oxlint-disable-next-line react-doctor/no-giant-component
export function TimeGrid({
  weekDates,
  initialSaisies,
  onCellClick,
  onSaveHours,
  joursFeries = EMPTY_JOURS_FERIES,
  absences = EMPTY_ABSENCES,
}: TimeGridProps) {
  // No longer filtering - absence rows were removed from saisies_temps (table absences is the source of truth)
  const saisies = initialSaisies;
  // Only display weekdays (Mon-Fri) in the grid
  const displayDates = weekDates.slice(0, 5);
  const { widths, startDrag } = useColumnWidths();
  const tableMinWidth = widths.projet + widths.day * 5 + widths.total;
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  );
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const mountedRef = useRef(true);

  // Cleanup au unmount. On lit explicitement `.current` au cleanup (pas une
  // copie capturee au mount) parce que saveStatusTimer.current est REASSIGNE
  // par handleCellSave apres le mount ; capturer au mount stockerait null.
  // debounceTimers.current est mute in-place (ajout de cles), donc OK.
  // ESLint exhaustive-deps ne distingue pas les deux cas - disable local.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(debounceTimers.current).forEach(clearTimeout);
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    };
  }, []);

  // Daily project hours (used for the row of "Total journalier" + gauges).
  // Full-day absence and jours feries -> zero (any zombie saisies are ignored).
  const dailyTotals = displayDates.map((date) =>
    computeDailyProjectTotal(date, saisies, absences, joursFeries),
  );

  const weeklyMax = computeWeeklyMax(weekDates, joursFeries);
  const absenceTotal = weekDates
    .slice(0, 5)
    .reduce((sum, d) => sum + (absences[d] || 0), 0);
  const weeklyTotal = computeWeekTotal({
    weekDates,
    saisies,
    absences,
    joursFeries,
  });

  const handleCellSave = (
    projetId: string,
    date: string,
    parsed: number,
  ): boolean => {
    // Daily max adjusted for absence hours on this day
    const absenceOnDay = absences[date] || 0;
    const dayMax = MAX_HEURES_JOUR - absenceOnDay;

    // Check daily max (project hours only, since absences are separate)
    const currentOther = saisies
      .filter((s) => s.projet_id !== projetId)
      .reduce((sum, s) => sum + (s.heures[date] || 0), 0);
    if (currentOther + parsed > dayMax) {
      toast.error(
        absenceOnDay > 0
          ? `Maximum ${dayMax}h de projet (absence de ${absenceOnDay}h)`
          : `Maximum ${MAX_HEURES_JOUR}h par jour`,
      );
      return false;
    }

    // Check weekly max. Same exclusion rule as the displayed totals:
    // skip jours feries AND days under a full-day absence so zombie
    // saisies do not falsely push the user over the limit.
    const currentWeekOther =
      weekDates
        .slice(0, 5)
        .filter((d) => !joursFeries[d] && (absences[d] || 0) < 7)
        .reduce(
          (sum, d) =>
            sum +
            saisies.reduce(
              (s, saisie) =>
                s +
                (d === date && saisie.projet_id === projetId
                  ? 0
                  : saisie.heures[d] || 0),
              0,
            ),
          0,
        ) + absenceTotal;
    if (currentWeekOther + parsed > weeklyMax) {
      toast.error(`Maximum ${formatHeures(weeklyMax)} par semaine`);
      return false;
    }

    // Capture the previous value so we can rollback if the server save fails.
    const previousValue =
      saisies.find((s) => s.projet_id === projetId)?.heures[date] ?? 0;

    // Notify parent of optimistic update (parent updates saisies state)
    onSaveHours?.(projetId, date, parsed);

    // Debounced server save
    const key = `${projetId}:${date}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(async () => {
      delete debounceTimers.current[key];
      if (!mountedRef.current) return;
      setSaveStatus('saving');
      // Le composant a pu unmount pendant le await (navigation). On gate les
      // setState pour ne pas tomber sur "setState on unmounted component".
      // oxlint-disable-next-line react-doctor/async-defer-await
      const result = await saveSaisieTemps(projetId, date, parsed);
      if (!mountedRef.current) return;
      if (result.success) {
        setSaveStatus('saved');
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => {
          if (mountedRef.current) setSaveStatus('idle');
        }, 2000);
      } else {
        // Rollback the optimistic update so the UI stops lying to the user
        // about a value that did not actually persist.
        onSaveHours?.(projetId, date, previousValue);
        setSaveStatus('idle');
        toast.error(result.error ?? 'Erreur lors de la sauvegarde');
      }
    }, DEBOUNCE_MS);

    return true;
  };

  return (
    <div className="relative">
      {/* Save status indicator */}
      <div className="pointer-events-none absolute -top-7 right-0 h-6">
        {saveStatus === 'saving' && (
          <span className="text-muted-foreground animate-pulse text-xs">
            Enregistrement…
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-primary animate-in fade-in text-xs duration-300">
            {'✓ Sauvegardé'}
          </span>
        )}
      </div>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table
          className="table-fixed border-collapse text-[13px]"
          style={{ width: tableMinWidth }}
        >
          <colgroup>
            <col style={{ width: widths.projet }} />
            {displayDates.map((d) => (
              <col key={d} style={{ width: widths.day }} />
            ))}
            <col style={{ width: widths.total }} />
          </colgroup>
          <thead>
            <tr className="bg-[var(--card-alt)]">
              <th className="text-muted-foreground relative px-3 py-2.5 text-left text-xs font-semibold tracking-wider uppercase">
                Projet
                <ResizeHandle onMouseDown={(e) => startDrag('projet', e)} />
              </th>
              {displayDates.map((date, i) => {
                const d = parseISO(date);
                const ferie = joursFeries[date];
                const today = isToday(d);
                const isLastDay = i === displayDates.length - 1;
                return (
                  <th
                    key={date}
                    className={cn(
                      'text-muted-foreground relative px-1 py-2.5 text-center text-xs font-semibold tracking-wider uppercase',
                      ferie && 'bg-[var(--card-alt)]',
                      today && !ferie && 'bg-[var(--primary-bg)]',
                    )}
                    title={ferie ?? undefined}
                  >
                    {DAY_LABELS[i]} {format(d, 'd', { locale: fr })}
                    {ferie && (
                      <div className="text-[9px] font-normal tracking-normal text-orange-500 normal-case">
                        {ferie}
                      </div>
                    )}
                    {/* On ne met une poignee que sur le dernier jour, qui sert
                        de proxy pour redimensionner les 5 colonnes (uniformes) */}
                    {isLastDay && (
                      <ResizeHandle onMouseDown={(e) => startDrag('day', e)} />
                    )}
                  </th>
                );
              })}
              <th className="text-muted-foreground relative px-2 py-2.5 text-center text-xs font-semibold tracking-wider uppercase">
                Total
                <ResizeHandle onMouseDown={(e) => startDrag('total', e)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {saisies.map((saisie, idx) => {
              const rowTotal = computeRowTotal(
                saisie,
                weekDates,
                absences,
                joursFeries,
              );

              const prev = idx > 0 ? saisies[idx - 1] : null;
              const isFirstInterne =
                saisie.est_interne && (!prev || !prev.est_interne);

              return (
                <tr
                  key={saisie.projet_id}
                  className={cn(
                    'border-b border-[var(--border-light)]',
                    saisie.est_interne && 'bg-amber-50/70',
                    isFirstInterne && 'border-t-2 border-t-amber-300',
                  )}
                  title={
                    saisie.est_interne
                      ? 'Temps interne - non comptabilise dans la production'
                      : undefined
                  }
                >
                  {/* Project label */}
                  <td
                    className={cn(
                      'px-3 py-2',
                      saisie.est_interne && 'border-l-[3px] border-l-amber-400',
                    )}
                  >
                    {(() => {
                      const prefix = `${saisie.projet_ref} - `;
                      const desc = saisie.projet_label.startsWith(prefix)
                        ? saisie.projet_label.slice(prefix.length)
                        : saisie.projet_label;
                      const fullTitle =
                        desc && desc !== saisie.projet_ref
                          ? `${saisie.projet_ref} - ${desc}`
                          : saisie.projet_ref;
                      return (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <div className="flex cursor-default items-center gap-2" />
                            }
                          >
                            <span
                              className={cn(
                                'shrink-0 font-mono text-[10px] font-semibold opacity-70',
                                saisie.est_interne
                                  ? 'text-amber-700'
                                  : 'text-primary',
                              )}
                            >
                              {saisie.projet_ref}
                            </span>
                            {desc && desc !== saisie.projet_ref && (
                              <span
                                className={cn(
                                  'min-w-0 flex-1 truncate text-[13px] font-medium',
                                  saisie.est_interne
                                    ? 'text-amber-900'
                                    : 'text-foreground',
                                )}
                              >
                                {desc}
                              </span>
                            )}
                            {saisie.est_interne && (
                              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-800 uppercase">
                                Interne
                              </span>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start">
                            {fullTitle}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </td>

                  {/* Day cells */}
                  {displayDates.map((date) => {
                    const d = parseISO(date);
                    const ferie = joursFeries[date];
                    const absenceOnDay = absences[date] || 0;
                    const fullDayAbsence = absenceOnDay >= 7;
                    const blocked = !!ferie || fullDayAbsence;
                    const today = isToday(d);
                    const cellValue = saisie.heures[date] || 0;

                    return (
                      <td
                        key={date}
                        className={cn(
                          'px-1 py-1.5 text-center',
                          blocked && 'bg-[var(--card-alt)]',
                          today && !blocked && 'bg-[var(--primary-bg)]',
                        )}
                      >
                        {blocked ? (
                          <span className="text-muted-foreground text-xs">
                            -
                          </span>
                        ) : (
                          <TimeCell
                            key={`${saisie.projet_id}:${date}:${weekDates[0]}`}
                            initialValue={cellValue}
                            today={today}
                            onSave={(parsed) =>
                              handleCellSave(saisie.projet_id, date, parsed)
                            }
                            onClickCell={
                              onCellClick
                                ? () => onCellClick(saisie.projet_id, date)
                                : undefined
                            }
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className="text-primary px-2 py-1.5 text-center font-mono text-[13px] font-bold">
                    {rowTotal > 0 ? formatHeures(rowTotal) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* Daily totals row with gauges */}
            <tr className="bg-[var(--card-alt)] font-bold">
              <td className="px-3 py-2 text-sm">Total journalier</td>
              {displayDates.map((date, i) => {
                const ferie = joursFeries[date];
                const blocked = !!ferie;
                const today = isToday(parseISO(date));
                const absOnDay = absences[date] || 0;
                const total = (dailyTotals[i] ?? 0) + absOnDay;
                const pct = Math.min(100, (total / MAX_HEURES_JOUR) * 100);
                const over = total > MAX_HEURES_JOUR;
                return (
                  <td
                    key={date}
                    className={cn(
                      'px-1 py-2 text-center',
                      blocked && 'bg-[var(--card-alt)]',
                      today && !blocked && 'bg-[var(--primary-bg)]',
                    )}
                  >
                    {blocked ? (
                      <span className="text-muted-foreground text-xs">-</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            'font-mono text-[13px] font-bold',
                            over
                              ? 'text-red-600'
                              : total >= MAX_HEURES_JOUR
                                ? 'text-primary'
                                : total > 0
                                  ? 'text-foreground'
                                  : 'text-muted-foreground',
                          )}
                        >
                          {total > 0 ? formatHeures(total) : '0h'}
                        </span>
                        <div className="bg-muted h-1 w-10 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              over
                                ? 'bg-red-500'
                                : total >= MAX_HEURES_JOUR
                                  ? 'bg-primary'
                                  : 'bg-orange-400',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
              {/* Weekly total with gauge */}
              <td className="p-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      'inline-block rounded-full px-3 py-0.5 font-mono text-[13px] font-bold text-white',
                      weeklyTotal > weeklyMax
                        ? 'bg-red-500'
                        : weeklyTotal >= weeklyMax
                          ? 'bg-primary'
                          : 'bg-orange-400',
                    )}
                  >
                    {formatHeures(weeklyTotal)}
                  </span>
                  <div className="bg-muted h-1 w-12 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        weeklyTotal > weeklyMax
                          ? 'bg-red-500'
                          : weeklyTotal >= weeklyMax
                            ? 'bg-primary'
                            : 'bg-orange-400',
                      )}
                      style={{
                        width: `${Math.min(100, (weeklyTotal / weeklyMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[10px] font-normal">
                    / {formatHeures(weeklyMax)}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TimeCellProps {
  initialValue: number;
  today: boolean;
  onSave: (parsed: number) => boolean;
  onClickCell?: () => void;
}

function TimeCell({ initialValue, today, onSave, onClickCell }: TimeCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = (v: number) => (v > 0 ? formatHeures(v) : '');

  // Sync the uncontrolled input visually whenever the source-of-truth value
  // changes from outside (server rollback after save failure, parent setState
  // post-fetch, undo). Only when the input is NOT focused, so we never
  // overwrite what the user is currently typing.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    // oxlint-disable-next-line react-doctor/no-event-handler
    const next = display(initialValue);
    if (input.value !== next) input.value = next;
  }, [initialValue]);

  const stepBy = (delta: number) => {
    const input = inputRef.current;
    if (!input) return;
    const current = parseTimeInput(input.value) ?? 0;
    const snapped = Math.round(current * 2) / 2;
    const next = Math.max(
      0,
      Math.min(MAX_HEURES_JOUR, Math.round((snapped + delta) * 2) / 2),
    );
    if (next === snapped) return;
    if (onSave(next)) {
      input.value = display(next);
    }
  };

  const btnClass =
    'border-border bg-white text-muted-foreground hover:text-primary hover:bg-muted/60 flex h-[28px] w-5 items-center justify-center rounded-md border transition-colors disabled:opacity-30';

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Retirer 30 minutes"
        onClick={(e) => {
          e.stopPropagation();
          stepBy(-0.5);
        }}
        className={btnClass}
      >
        <Minus className="size-3" strokeWidth={2.5} />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        aria-label="Saisie du temps en heures"
        className={cn(
          'h-[28px] w-[44px] rounded-md border bg-white px-1 text-center font-mono text-[13px] transition-colors outline-none',
          'border-border focus:border-primary focus:ring-primary/15 focus:ring-2',
          today && 'border-primary shadow-[0_0_0_2px_rgba(22,163,74,0.15)]',
        )}
        defaultValue={initialValue > 0 ? formatHeures(initialValue) : ''}
        placeholder="0h"
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            stepBy(0.5);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            stepBy(-0.5);
          }
        }}
        onBlur={(e) => {
          const parsed = parseTimeInput(e.target.value);
          if (parsed === null) {
            // Invalid input - restore last accepted value
            e.target.value = display(initialValue);
            return;
          }
          if (onSave(parsed)) {
            e.target.value = display(parsed);
          } else {
            // Validation rejected - restore last accepted value
            e.target.value = display(initialValue);
          }
        }}
        onClick={onClickCell}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Ajouter 30 minutes"
        onClick={(e) => {
          e.stopPropagation();
          stepBy(0.5);
        }}
        className={btnClass}
      >
        <Plus className="size-3" strokeWidth={2.5} />
      </button>
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
