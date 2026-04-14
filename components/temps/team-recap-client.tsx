'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { format, parseISO, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import type { TeamMemberSummary } from '@/lib/queries/temps';
import { fetchTeamWeekData } from '@/lib/actions/temps';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { TimeWeekNavigator } from '@/components/temps/time-week-navigator';
import { cn } from '@/lib/utils';
import { formatHeures } from '@/lib/utils/formatters';
import { MAX_HEURES_JOUR } from '@/lib/utils/constants';

interface TeamRecapClientProps {
  weekDates: string[];
  initialSummary: TeamMemberSummary[];
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getDayCellColor(heures: number): string {
  if (heures >= MAX_HEURES_JOUR)
    return 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400';
  if (heures > 0)
    return 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400';
  return 'bg-red-50 text-red-400 dark:bg-red-950/20 dark:text-red-500';
}

export function TeamRecapClient({
  weekDates: initialWeekDates,
  initialSummary,
}: TeamRecapClientProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState(initialWeekDates);
  const [summary, setSummary] = useState<TeamMemberSummary[]>(initialSummary);
  const [isPending, startTransition] = useTransition();

  const changeWeek = useCallback((newOffset: number) => {
    setWeekOffset(newOffset);
    startTransition(async () => {
      const result = await fetchTeamWeekData(newOffset);
      setWeekDates(result.weekDates);
      setSummary(result.summary);
    });
  }, []);

  // Only weekdays (Mon-Fri)
  const weekdayDates = weekDates.slice(0, 5);

  // Grand total for the team
  const teamTotal = summary.reduce((sum, m) => sum + m.weekTotal, 0);

  return (
    <div>
      <PageHeader
        title="Suivi de temps — Equipe"
        description="Récapitulatif hebdomadaire de l'équipe"
      >
        <Link href="/temps">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Ma semaine
          </Button>
        </Link>
      </PageHeader>

      <TimeWeekNavigator
        weekDates={weekDates}
        onPrev={() => changeWeek(weekOffset - 1)}
        onNext={() => changeWeek(weekOffset + 1)}
        onToday={() => changeWeek(0)}
        loading={isPending}
      />

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[var(--card-alt)]">
              <th className="text-muted-foreground min-w-[200px] px-3 py-2.5 text-left text-xs font-semibold tracking-wider uppercase">
                Collaborateur
              </th>
              {weekdayDates.map((date, i) => {
                const d = parseISO(date);
                const today = isToday(d);
                return (
                  <th
                    key={date}
                    className={cn(
                      'text-muted-foreground w-[80px] px-1 py-2.5 text-center text-xs font-semibold tracking-wider uppercase',
                      today && 'bg-[var(--primary-bg)]',
                    )}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="font-normal">
                      {format(d, 'd MMM', { locale: fr })}
                    </div>
                  </th>
                );
              })}
              <th className="text-muted-foreground w-[80px] px-2 py-2.5 text-center text-xs font-semibold tracking-wider uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 && (
              <tr>
                <td
                  colSpan={weekdayDates.length + 2}
                  className="text-muted-foreground px-4 py-8 text-center text-sm"
                >
                  Aucun collaborateur actif
                </td>
              </tr>
            )}
            {summary.map((member) => (
              <tr
                key={member.userId}
                className="border-b border-[var(--border-light)] transition-colors hover:bg-[var(--card-alt)]/50"
              >
                {/* Collaborator name */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold">
                      {(member.prenom?.[0] ?? '').toUpperCase()}
                      {(member.nom?.[0] ?? '').toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium">
                        {member.prenom} {member.nom}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Day cells */}
                {weekdayDates.map((date) => {
                  const d = parseISO(date);
                  const today = isToday(d);
                  const heures = member.dailyTotals[date] ?? 0;

                  return (
                    <td
                      key={date}
                      className={cn(
                        'px-1 py-1.5 text-center',
                        today && 'bg-[var(--primary-bg)]',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block min-w-[48px] rounded-md px-2 py-1 font-mono text-[13px] font-medium',
                          getDayCellColor(heures),
                        )}
                      >
                        {heures > 0 ? formatHeures(heures) : '—'}
                      </span>
                    </td>
                  );
                })}

                {/* Row total */}
                <td className="px-2 py-1.5 text-center font-mono text-[13px] font-bold">
                  <span
                    className={cn(
                      member.weekTotal >= 35
                        ? 'text-green-700 dark:text-green-400'
                        : member.weekTotal > 0
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-muted-foreground',
                    )}
                  >
                    {member.weekTotal > 0
                      ? formatHeures(member.weekTotal)
                      : '0h'}
                  </span>
                </td>
              </tr>
            ))}

            {/* Team totals row */}
            {summary.length > 0 && (
              <tr className="bg-[var(--card-alt)] font-bold">
                <td className="px-3 py-2.5 text-sm">
                  Total équipe ({summary.length} collaborateurs)
                </td>
                {weekdayDates.map((date) => {
                  const today = isToday(parseISO(date));
                  const total = summary.reduce(
                    (sum, m) => sum + (m.dailyTotals[date] ?? 0),
                    0,
                  );
                  return (
                    <td
                      key={date}
                      className={cn(
                        'px-1 py-2.5 text-center font-mono text-[13px]',
                        today && 'bg-[var(--primary-bg)]',
                        total > 0 && 'text-primary',
                      )}
                    >
                      {total > 0 ? formatHeures(total) : '0h'}
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-center">
                  <span className="bg-primary inline-block rounded-full px-3.5 py-1 font-mono text-[13px] font-bold text-white">
                    {formatHeures(teamTotal)}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
