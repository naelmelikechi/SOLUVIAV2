'use client';

import { useState, useRef, useEffect } from 'react';
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
  joursFeries?: Record<string, string>;
  /** date -> absence hours (from the absence banner). Full day = 7, half = 3.5 */
  absences?: Record<string, number>;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function TimeGrid({
  weekDates,
  initialSaisies,
  onCellClick,
  onSaveHours,
  joursFeries = {},
  absences = {},
}: TimeGridProps) {
  // Filter out absence rows — they are now managed by the AbsenceBanner
  const saisies = initialSaisies.filter((s) => !s.est_absence);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  );
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    const statusTimer = saveStatusTimer.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      if (statusTimer) clearTimeout(statusTimer);
    };
  }, []);

  // Calculate daily totals (project hours only — absences tracked separately)
  const dailyTotals = weekDates.map((date) =>
    saisies.reduce((sum, s) => sum + (s.heures[date] || 0), 0),
  );

  // Count working days (Mon-Fri minus holidays)
  const workingDays = weekDates
    .slice(0, 5)
    .filter((d) => !joursFeries[d]).length;
  const weeklyMax = workingDays * MAX_HEURES_JOUR;
  // Weekly total includes both project hours and absence hours
  const absenceTotal = weekDates
    .slice(0, 5)
    .reduce((sum, d) => sum + (absences[d] || 0), 0);
  const weeklyTotal =
    weekDates
      .slice(0, 5)
      .filter((d) => !joursFeries[d])
      .reduce(
        (sum, d) =>
          sum + saisies.reduce((s, saisie) => s + (saisie.heures[d] || 0), 0),
        0,
      ) + absenceTotal;

  const handleCellChange = (projetId: string, date: string, value: string) => {
    const parsed = parseTimeInput(value);
    if (parsed === null) return;

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
      return;
    }

    // Check weekly max
    const currentWeekOther =
      weekDates
        .slice(0, 5)
        .filter((d) => !joursFeries[d])
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
      return;
    }

    // Notify parent of optimistic update (parent updates saisies state)
    onSaveHours?.(projetId, date, parsed);

    // Debounced server save
    const key = `${projetId}:${date}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(async () => {
      delete debounceTimers.current[key];
      setSaveStatus('saving');
      const result = await saveSaisieTemps(projetId, date, parsed);
      if (result.success) {
        setSaveStatus('saved');
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('idle');
        toast.error(result.error ?? 'Erreur lors de la sauvegarde');
      }
    }, DEBOUNCE_MS);
  };

  return (
    <div className="relative">
      {/* Save status indicator */}
      <div className="pointer-events-none absolute -top-7 right-0 h-6">
        {saveStatus === 'saving' && (
          <span className="text-muted-foreground animate-pulse text-xs">
            Enregistrement...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-primary animate-in fade-in text-xs duration-300">
            {'✓ Sauvegardé'}
          </span>
        )}
      </div>
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
                const ferie = joursFeries[date];
                const today = isToday(d);
                return (
                  <th
                    key={date}
                    className={cn(
                      'text-muted-foreground w-[68px] px-1 py-2.5 text-center text-xs font-semibold tracking-wider uppercase',
                      (weekend || ferie) && 'bg-[var(--card-alt)]',
                      today && !ferie && 'bg-[var(--primary-bg)]',
                    )}
                    title={ferie ?? undefined}
                  >
                    {DAY_LABELS[i]} {!weekend && format(d, 'd', { locale: fr })}
                    {ferie && (
                      <div className="text-[9px] font-normal tracking-normal text-orange-500 normal-case">
                        {ferie}
                      </div>
                    )}
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
              const rowTotal = weekDates
                .slice(0, 5)
                .reduce((sum, d) => sum + (saisie.heures[d] || 0), 0);

              return (
                <tr
                  key={saisie.projet_id}
                  className="border-b border-[var(--border-light)]"
                >
                  {/* Project label */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-mono text-xs font-bold">
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
                    const ferie = joursFeries[date];
                    const absenceOnDay = absences[date] || 0;
                    const fullDayAbsence = absenceOnDay >= 7;
                    const blocked = weekend || !!ferie || fullDayAbsence;
                    const today = isToday(d);
                    const dayMax = MAX_HEURES_JOUR - absenceOnDay;
                    const dayTotal = saisies.reduce(
                      (sum, s) => sum + (s.heures[date] || 0),
                      0,
                    );
                    const atMax = dayTotal >= dayMax;
                    const cellValue = saisie.heures[date] || 0;

                    const disabled = blocked || (atMax && cellValue === 0);

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
                          <input
                            type="text"
                            inputMode="decimal"
                            className={cn(
                              'w-[52px] rounded-md border bg-white px-1 py-1.5 text-center font-mono text-[13px] transition-colors outline-none',
                              'border-border focus:border-primary focus:ring-primary/15 focus:ring-2',
                              today &&
                                'border-primary shadow-[0_0_0_2px_rgba(22,163,74,0.15)]',
                              disabled && 'opacity-30',
                            )}
                            disabled={disabled}
                            defaultValue={
                              cellValue > 0 ? String(cellValue) : ''
                            }
                            placeholder="0"
                            onBlur={(e) =>
                              handleCellChange(
                                saisie.projet_id,
                                date,
                                e.target.value,
                              )
                            }
                            onClick={() => {
                              if (onCellClick) {
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
                    {rowTotal > 0 ? formatHeures(rowTotal) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* Daily totals row with gauges */}
            <tr className="bg-[var(--card-alt)] font-bold">
              <td className="px-3 py-2 text-sm">Total journalier</td>
              {weekDates.map((date, i) => {
                const weekend = i >= 5;
                const ferie = joursFeries[date];
                const blocked = weekend || !!ferie;
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
              <td className="px-2 py-2 text-center">
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
