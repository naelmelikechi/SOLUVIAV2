'use client';

import { useState, useCallback } from 'react';
import { getMockWeekDates, getMockSaisiesForWeek } from '@/lib/mock-data';
import { PageHeader } from '@/components/shared/page-header';
import { TimeWeekNavigator } from '@/components/temps/time-week-navigator';
import { TimeGrid } from '@/components/temps/time-grid';
import { TimeAxisPanel } from '@/components/temps/time-axis-panel';

export default function TempsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{
    projetId: string;
    date: string;
  } | null>(null);

  const weekDates = getMockWeekDates(weekOffset);
  const saisies = getMockSaisiesForWeek(weekDates);

  const selectedSaisie = selectedCell
    ? saisies.find((s) => s.projet_id === selectedCell.projetId)
    : null;

  const handleCellClick = useCallback((projetId: string, date: string) => {
    setSelectedCell({ projetId, date });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedCell(null);
  }, []);

  const handleSaveAxes = useCallback(() => {
    // In real app: save axes to Supabase
    // For mock: just close
    setSelectedCell(null);
  }, []);

  return (
    <div>
      <PageHeader title="Suivi de temps" description="Ma semaine" />

      <TimeWeekNavigator
        weekDates={weekDates}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
        onToday={() => setWeekOffset(0)}
      />

      <div className="flex gap-4">
        {/* Main grid */}
        <div className="min-w-0 flex-1">
          <TimeGrid
            weekDates={weekDates}
            initialSaisies={saisies}
            onCellClick={handleCellClick}
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
