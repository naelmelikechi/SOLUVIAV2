'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { Copy, Download, Users, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SaisieTemps } from '@/lib/queries/temps';
import {
  fetchWeekData,
  saveSaisieTempsAxes,
  copyPreviousWeek,
  fetchAvailableProjets,
  addProjetToWeek,
} from '@/lib/actions/temps';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { TimeWeekNavigator } from '@/components/temps/time-week-navigator';
import { TimeGrid } from '@/components/temps/time-grid';
import { TimeAxisPanel } from '@/components/temps/time-axis-panel';
import { formatHeures } from '@/lib/utils/formatters';

interface TempsPageClientProps {
  weekDates: string[];
  initialSaisies: SaisieTemps[];
  isAdmin?: boolean;
}

export function TempsPageClient({
  weekDates: initialWeekDates,
  initialSaisies,
  isAdmin,
}: TempsPageClientProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState(initialWeekDates);
  const [saisies, setSaisies] = useState<SaisieTemps[]>(initialSaisies);
  const [isPending, startTransition] = useTransition();

  const [selectedCell, setSelectedCell] = useState<{
    projetId: string;
    date: string;
  } | null>(null);

  // Add project dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availableProjets, setAvailableProjets] = useState<
    { id: string; ref: string; label: string }[]
  >([]);
  const [addingProjet, setAddingProjet] = useState(false);

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

  const handleOpenAddDialog = useCallback(async () => {
    setAddDialogOpen(true);
    const projets = await fetchAvailableProjets();
    // Filter out projects already in the grid
    const existingIds = new Set(saisies.map((s) => s.projet_id));
    setAvailableProjets(projets.filter((p) => !existingIds.has(p.id)));
  }, [saisies]);

  const handleAddProjet = useCallback(
    async (projet: { id: string; ref: string; label: string }) => {
      setAddingProjet(true);
      const monday = weekDates[0]!;
      const result = await addProjetToWeek(projet.id, monday);
      setAddingProjet(false);

      if (result.success) {
        // Add empty row to local state
        setSaisies((prev) => [
          ...prev,
          {
            projet_id: projet.id,
            projet_ref: projet.ref,
            projet_label: projet.label,
            est_absence: false,
            heures: {},
            axes: {},
          },
        ]);
        setAddDialogOpen(false);
        toast.success(`${projet.ref} ajouté à votre semaine`);
      } else {
        toast.error(result.error ?? 'Erreur');
      }
    },
    [weekDates],
  );

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

      // Save axes (fire-and-forget, we update UI optimistically)
      await saveSaisieTempsAxes(selectedCell.projetId, selectedCell.date, axes);

      // Also save the total hours (so the cell updates automatically)
      if (total > 0) {
        const { saveSaisieTemps } = await import('@/lib/actions/temps');
        await saveSaisieTemps(selectedCell.projetId, selectedCell.date, total);
      }

      // Update parent state: axes + heures (regardless of axes save result)
      const cellProjetId = selectedCell.projetId;
      const cellDate = selectedCell.date;

      setSaisies((prev) =>
        prev.map((s) => {
          if (s.projet_id !== cellProjetId) return s;
          return {
            ...s,
            heures: { ...s.heures, [cellDate]: total },
            axes: { ...s.axes, [cellDate]: axes },
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
    });
  }, [weekDates, weekOffset]);

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const rows = saisies.map((s) => {
      const row: Record<string, string | number> = {
        Projet: s.projet_label,
      };
      weekDates.forEach((date, i) => {
        row[dayLabels[i]!] = s.heures[date] || 0;
      });
      const total = weekDates
        .slice(0, 5)
        .reduce((sum, d) => sum + (s.heures[d] || 0), 0);
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
          <button
            onClick={handleOpenAddDialog}
            className="border-border text-muted-foreground hover:border-primary/30 hover:text-foreground mt-4 flex w-full items-center gap-3 rounded-[10px] border-2 border-dashed px-5 py-3.5 text-sm transition-colors"
          >
            <span className="text-primary flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-sm font-bold">
              <Plus className="h-4 w-4" />
            </span>
            Ajouter un projet à ma semaine...
          </button>

          {/* Add project dialog */}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un projet</DialogTitle>
              </DialogHeader>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {availableProjets.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Tous vos projets sont déjà dans la semaine
                  </p>
                ) : (
                  availableProjets.map((projet) => (
                    <button
                      key={projet.id}
                      disabled={addingProjet}
                      onClick={() => handleAddProjet(projet)}
                      className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                    >
                      <span className="text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold">
                        {projet.ref}
                      </span>
                      <span className="text-sm">{projet.label}</span>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
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
