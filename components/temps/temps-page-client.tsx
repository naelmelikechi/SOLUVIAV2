'use client';

import { useState, useCallback, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { Copy, Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { SaisieTemps } from '@/lib/queries/temps';
import {
  fetchWeekData,
  fetchAbsencesForWeek,
  saveSaisieTemps,
  saveSaisieTempsAxes,
  copyPreviousWeek,
} from '@/lib/actions/temps';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { TimeWeekNavigator } from '@/components/temps/time-week-navigator';
import { TimeGrid } from '@/components/temps/time-grid';
import { TimeAxisPanel } from '@/components/temps/time-axis-panel';
import { WeekStatusPanel } from '@/components/temps/week-status-panel';
import { formatHeures } from '@/lib/utils/formatters';
import {
  computeAbsenceHoursPerDay,
  type AbsencePeriod,
} from '@/lib/utils/absences';

interface TempsPageClientProps {
  weekDates: string[];
  initialSaisies: SaisieTemps[];
  initialAbsences: AbsencePeriod[];
  isAdmin?: boolean;
  joursFeries?: Record<string, string>;
  totals?: {
    weekTotal: number;
    monthTotal: number;
    yearTotal: number;
    annee: number;
  };
}

export function TempsPageClient({
  weekDates: initialWeekDates,
  initialSaisies,
  initialAbsences,
  isAdmin,
  joursFeries: initialJoursFeries = {},
  totals,
}: TempsPageClientProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState(initialWeekDates);
  const [saisies, setSaisies] = useState<SaisieTemps[]>(initialSaisies);
  const [absences, setAbsences] = useState<AbsencePeriod[]>(initialAbsences);
  const [joursFeries, setJoursFeries] =
    useState<Record<string, string>>(initialJoursFeries);
  const [isPending, startTransition] = useTransition();

  const [selectedCell, setSelectedCell] = useState<{
    projetId: string;
    date: string;
  } | null>(null);

  const selectedSaisie = selectedCell
    ? saisies.find((s) => s.projet_id === selectedCell.projetId)
    : null;

  const absencesPerDate = useMemo(
    () => computeAbsenceHoursPerDay(absences, weekDates),
    [absences, weekDates],
  );

  /** Heures de projet par jour */
  const saisiesHoursPerDate = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const proj of saisies) {
      for (const [date, h] of Object.entries(proj.heures)) {
        map[date] = (map[date] ?? 0) + h;
      }
    }
    return map;
  }, [saisies]);

  /** Conversion absencesPerDate -> Record<date, number> pour time-grid (legacy shape, sera retire Task 8) */
  const absenceHoursMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const [date, info] of Object.entries(absencesPerDate)) {
      map[date] = info.hours;
    }
    return map;
  }, [absencesPerDate]);

  const changeWeek = useCallback((newOffset: number) => {
    setWeekOffset(newOffset);
    setSelectedCell(null);
    startTransition(async () => {
      const result = await fetchWeekData(newOffset);
      setWeekDates(result.weekDates);
      setSaisies(result.saisies);
      setAbsences(result.absences);
      setJoursFeries(result.joursFeries);
    });
  }, []);

  const refreshAbsences = useCallback(() => {
    startTransition(async () => {
      const fresh = await fetchAbsencesForWeek(weekDates);
      setAbsences(fresh);
    });
  }, [weekDates]);

  const handleCellClick = useCallback((projetId: string, date: string) => {
    setSelectedCell({ projetId, date });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedCell(null);
  }, []);

  const handleSaveHours = useCallback(
    (projetId: string, date: string, heures: number) => {
      // Optimistic update of local state
      setSaisies((prev) =>
        prev.map((s) => {
          if (s.projet_id !== projetId) return s;
          return { ...s, heures: { ...s.heures, [date]: heures } };
        }),
      );
    },
    [],
  );

  const handleSaveAxes = useCallback(
    async (axes: Record<string, number>, total: number) => {
      if (!selectedCell) return;
      const cellProjetId = selectedCell.projetId;
      const cellDate = selectedCell.date;

      // IMPORTANT: la saisie_temps DOIT exister avant d ecrire ses axes
      // (saveSaisieTempsAxes fait un .maybeSingle() sur la saisie et refuse
      // sinon). On sauve donc d abord les heures, puis les axes.
      if (total > 0) {
        const r = await saveSaisieTemps(cellProjetId, cellDate, total);
        if (!r.success) {
          toast.error(r.error ?? 'Erreur lors de la sauvegarde des heures');
          return;
        }
      } else {
        // total == 0 : on supprime la saisie. saveSaisieTemps gere ce cas
        // (DELETE) et cascade supprime les axes via FK.
        const r = await saveSaisieTemps(cellProjetId, cellDate, 0);
        if (!r.success) {
          toast.error(r.error ?? 'Erreur lors de la suppression');
          return;
        }
      }

      // total == 0 : pas besoin de poser des axes (la saisie est supprimee
      // ou il n y a rien a repartir).
      if (total > 0) {
        const r = await saveSaisieTempsAxes(cellProjetId, cellDate, axes);
        if (!r.success) {
          toast.error(r.error ?? 'Erreur lors de la sauvegarde des axes');
          return;
        }
      }

      // Update parent state: axes + heures (apres succes serveur)
      setSaisies((prev) =>
        prev.map((s) => {
          if (s.projet_id !== cellProjetId) return s;
          return {
            ...s,
            heures: { ...s.heures, [cellDate]: total },
            axes: { ...s.axes, [cellDate]: total > 0 ? axes : {} },
          };
        }),
      );
      setSelectedCell(null);
    },
    [selectedCell],
  );

  const handleCopyPreviousWeek = useCallback(() => {
    startTransition(async () => {
      const result = await copyPreviousWeek(weekDates);
      if (!result.success) {
        toast.error(result.error ?? 'Erreur lors de la copie');
        return;
      }
      if (result.copied === 0) {
        toast.info('Aucune saisie à copier depuis la semaine précédente');
        return;
      }
      toast.success(`${result.copied} saisie(s) copiée(s) depuis S-1`);
      // Refresh week data
      const refreshed = await fetchWeekData(weekOffset);
      setWeekDates(refreshed.weekDates);
      setSaisies(refreshed.saisies);
      setAbsences(refreshed.absences);
      setJoursFeries(refreshed.joursFeries);
    });
  }, [weekDates, weekOffset]);

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    const weekdayDates = weekDates.slice(0, 5);
    const rows = saisies.map((s) => {
      const row: Record<string, string | number> = {
        Projet: s.projet_label,
      };
      weekdayDates.forEach((date, i) => {
        row[dayLabels[i]!] = s.heures[date] || 0;
      });
      const total = weekdayDates.reduce(
        (sum, d) => sum + (s.heures[d] || 0),
        0,
      );
      row['Total'] = formatHeures(total);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Temps');
    XLSX.writeFile(
      wb,
      `temps_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <div>
      <PageHeader title="Suivi de temps" description="Ma semaine">
        {isAdmin && (
          <Link href="/temps/equipe">
            <Button variant="outline" size="sm">
              <Users className="mr-1.5 h-4 w-4" />
              Vue équipe
            </Button>
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyPreviousWeek}
          disabled={isPending}
        >
          <Copy className="mr-1.5 h-4 w-4" />
          Recopier S-1
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </PageHeader>

      {totals && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <TempsStatTile
            label="Cette semaine"
            value={formatHeures(totals.weekTotal)}
            sub="35h théorique"
          />
          <TempsStatTile
            label="Cumul mois"
            value={formatHeures(totals.monthTotal)}
          />
          <TempsStatTile
            label={`Cumul ${totals.annee}`}
            value={formatHeures(totals.yearTotal)}
          />
        </div>
      )}

      <div className="mb-4">
        <TimeWeekNavigator
          weekDates={weekDates}
          onPrev={() => changeWeek(weekOffset - 1)}
          onNext={() => changeWeek(weekOffset + 1)}
          onToday={() => changeWeek(0)}
          loading={isPending}
        />
      </div>

      <div className="flex gap-4">
        {/* Main grid */}
        <div className="min-w-0 flex-1">
          <TimeGrid
            weekDates={weekDates}
            initialSaisies={saisies}
            onCellClick={handleCellClick}
            onSaveHours={handleSaveHours}
            joursFeries={joursFeries}
            absences={absenceHoursMap}
          />
        </div>

        {/* Right side panel: axes form when a cell is selected, otherwise week status */}
        {selectedCell && selectedSaisie ? (
          <TimeAxisPanel
            saisie={selectedSaisie}
            date={selectedCell.date}
            cellTotal={selectedSaisie.heures[selectedCell.date] || 0}
            dailyMax={(() => {
              const MAX_H = 7;
              const absOnDay = absenceHoursMap[selectedCell.date] || 0;
              const otherOnDay = saisies
                .filter((s) => s.projet_id !== selectedCell.projetId)
                .reduce(
                  (sum, s) => sum + (s.heures[selectedCell.date] || 0),
                  0,
                );
              return MAX_H - absOnDay - otherOnDay;
            })()}
            weeklyRemaining={(() => {
              const workDays = weekDates
                .slice(0, 5)
                .filter((d) => !joursFeries[d]).length;
              const maxWeek = workDays * 7;
              const absTotal = weekDates
                .slice(0, 5)
                .reduce((sum, d) => sum + (absenceHoursMap[d] || 0), 0);
              const currentWeek = weekDates
                .slice(0, 5)
                .filter((d) => !joursFeries[d])
                .reduce(
                  (sum, d) =>
                    sum +
                    saisies.reduce(
                      (s, saisie) =>
                        s +
                        (d === selectedCell.date &&
                        saisie.projet_id === selectedCell.projetId
                          ? 0
                          : saisie.heures[d] || 0),
                      0,
                    ),
                  0,
                );
              return maxWeek - absTotal - currentWeek;
            })()}
            onClose={handleClosePanel}
            onSave={handleSaveAxes}
          />
        ) : (
          <WeekStatusPanel
            weekDates={weekDates}
            absencesPerDate={absencesPerDate}
            absences={absences}
            saisiesHoursPerDate={saisiesHoursPerDate}
            joursFeries={joursFeries}
            onChanged={refreshAbsences}
          />
        )}
      </div>
    </div>
  );
}

function TempsStatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border rounded-[10px] border bg-white px-4 py-3 shadow-sm">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}
