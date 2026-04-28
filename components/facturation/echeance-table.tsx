'use client';

import { useState, useMemo, useCallback, useTransition } from 'react';
import { Eye } from 'lucide-react';
import type { EcheancePending } from '@/lib/queries/factures';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { formatCurrency } from '@/lib/utils/formatters';
import { toast } from 'sonner';
import { createFactures } from '@/lib/actions/factures';

interface EcheanceTableProps {
  echeances: EcheancePending[];
  onPreview?: (echeanceId: string) => void;
}

export function EcheanceTable({ echeances, onPreview }: EcheanceTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');

  const filteredEcheances = useMemo(
    () =>
      filterBySearch(echeances, search, (e) =>
        [
          e.projet?.ref,
          e.projet?.client?.raison_sociale,
          e.mois_concerne,
          formatCurrency(e.montant_prevu_ht),
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [echeances, search],
  );

  const allSelected =
    filteredEcheances.length > 0 &&
    filteredEcheances.every((e) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEcheances.map((e) => e.id)));
    }
  }, [allSelected, filteredEcheances]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectedTotal = useMemo(
    () =>
      echeances
        .filter((e) => selectedIds.has(e.id))
        .reduce((sum, e) => sum + e.montant_prevu_ht, 0),
    [echeances, selectedIds],
  );

  const handleEmettre = () => {
    startTransition(async () => {
      const result = await createFactures(Array.from(selectedIds));
      if (result.success) {
        toast.success(
          `${result.refs.length} facture${result.refs.length > 1 ? 's' : ''} émise${result.refs.length > 1 ? 's' : ''} avec succès`,
        );
        setSelectedIds(new Set());
      } else {
        toast.error(result.error ?? 'Erreur lors de la création');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <TableSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher une échéance..."
      />
      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              <TableHead>Projet</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Mois concerné</TableHead>
              <TableHead className="text-right">Montant HT</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEcheances.length > 0 ? (
              filteredEcheances.map((echeance) => {
                const projetRef = echeance.projet?.ref ?? '';
                const clientName =
                  echeance.projet?.client?.raison_sociale ?? '';

                return (
                  <TableRow
                    key={echeance.id}
                    data-state={
                      selectedIds.has(echeance.id) ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(echeance.id)}
                        onCheckedChange={() => toggleOne(echeance.id)}
                        aria-label={`Sélectionner ${projetRef}`}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold">
                        {projetRef}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{clientName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{echeance.mois_concerne}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-sm tabular-nums">
                        {formatCurrency(echeance.montant_prevu_ht)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {onPreview && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Aperçu PDF"
                          title="Aperçu PDF (brouillon)"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreview(echeance.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground h-24 text-center"
                >
                  Aucune échéance à facturer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer bar */}
      <div className="border-border bg-background sticky bottom-0 mt-4 flex items-center justify-between rounded-lg border px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {selectedIds.size} échéance{selectedIds.size > 1 ? 's' : ''}{' '}
          sélectionnée{selectedIds.size > 1 ? 's' : ''} · Total :{' '}
          <span className="text-foreground font-medium tabular-nums">
            {formatCurrency(selectedTotal)} HT
          </span>
        </p>
        <Button
          disabled={selectedIds.size === 0 || isPending}
          onClick={handleEmettre}
        >
          {isPending ? 'Émission en cours...' : 'Émettre les factures'}
        </Button>
      </div>
    </div>
  );
}
