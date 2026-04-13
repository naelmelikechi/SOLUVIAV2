'use client';

import { useState, useCallback, useTransition } from 'react';
import type { SaisieTemps } from '@/lib/queries/temps';
import { fetchWeekData, saveSaisieTempsAxes } from '@/lib/actions/temps';
import { PageHeader } from '@/components/shared/page-header';
import { TimeWeekNavigator } from '@/components/temps/time-week-navigator';
import { TimeGrid } from '@/components/temps/time-grid';
import { TimeAxisPanel } from '@/components/temps/time-axis-panel';

interface TempsPageClientProps {
  weekDates: string[];
  initialSaisies: SaisieTemps[];
}

export function TempsPageClient({
  weekDates: initialWeekDates,
  initialSaisies,
}: TempsPageClientProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState(initialWeekDates);
  const [saisies, setSaisies] = useState<SaisieTemps[]>(initialSaisies);
  const [isPending, startTransition] = useTransition();

  const [selectedCell, setSelectedCell] = useState<{
    projetId: string;
    date: string;
  } | null>(null);

  const selectedSaisie = selectedCell
    ? saisies.find((s) => s.projet_id === selectedCell.projetId)
    : null;

  const changeWeek = useCallback((newOffset: number) => {
    setWeekOffset(newOffset);
    setSelectedCell(null);
    startTransition(async () => {
      const result = await fetchWeekData(newOffset);
      setWeekDates(result.weekDates);
      setSaisies(result.saisies);
    });
  }, []);

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
    async (axes: Record<string, number>) => {
      if (!selectedCell) return;
      const result = await saveSaisieTempsAxes(
        selectedCell.projetId,
        selectedCell.date,
        axes,
      );
      if (result.success) {
        // Update local axes state
        setSaisies((prev) =>
          prev.map((s) => {
            if (s.projet_id !== selectedCell.projetId) return s;
            return {
              ...s,
              axes: { ...s.axes, [selectedCell.date]: axes },
            };
          }),
        );
      }
      setSelectedCell(null);
    },
    [selectedCell],
  );

  return (
    <div>
      <PageHeader title="Suivi de temps" description="Ma semaine" />

      <TimeWeekNavigator
        weekDates={weekDates}
        onPrev={() => changeWeek(weekOffset - 1)}
        onNext={() => changeWeek(weekOffset + 1)}
        onToday={() => changeWeek(0)}
        loading={isPending}
      />

      <div className="flex gap-4">
        {/* Main grid */}
        <div className="min-w-0 flex-1">
          <TimeGrid
            weekDates={weekDates}
            initialSaisies={saisies}
            onCellClick={handleCellClick}
            onSaveHours={handleSaveHours}
          />

          {/* Add project */}
          <button className="border-border text-muted-foreground hover:border-primary/30 hover:text-foreground mt-4 flex w-full items-center gap-3 rounded-[10px] border-2 border-dashed px-5 py-3.5 text-sm transition-colors">
            <span className="text-primary flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-sm font-bold">
              +
            </span>
            Ajouter un projet à ma semaine...
          </button>
        </div>

        {/* Axis panel */}
        {selectedCell && selectedSaisie && (
          <TimeAxisPanel
            saisie={selectedSaisie}
            date={selectedCell.date}
            cellTotal={selectedSaisie.heures[selectedCell.date] || 0}
            onClose={handleClosePanel}
            onSave={handleSaveAxes}
          />
        )}
      </div>
    </div>
  );
}
