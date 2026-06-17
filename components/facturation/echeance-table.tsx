'use client';

import { useMemo, useTransition } from 'react';
import { Eye } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { EcheancePending } from '@/lib/queries/factures';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { formatCurrency } from '@/lib/utils/formatters';
import { htToTtc } from '@/lib/utils/montant-ht';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';
import { toast } from 'sonner';
import { createFactures } from '@/lib/actions/factures';

interface EcheanceTableProps {
  echeances: EcheancePending[];
  onPreview?: (echeanceId: string) => void;
}

export function EcheanceTable({ echeances, onPreview }: EcheanceTableProps) {
  const [isPending, startTransition] = useTransition();

  const columns = useMemo<ColumnDef<EcheancePending>[]>(
    () => [
      {
        id: 'preview',
        enableSorting: false,
        enableHiding: false,
        size: 40,
        cell: ({ row }) =>
          onPreview ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Aperçu PDF"
              title="Aperçu PDF (brouillon)"
              onClick={(e) => {
                e.stopPropagation();
                onPreview(row.original.id);
              }}
            >
              <Eye className="size-4" />
            </Button>
          ) : null,
      },
      {
        id: 'projet',
        accessorFn: (e) => e.projet?.ref ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Projet" />
        ),
        cell: ({ getValue }) => (
          <span className="text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'client',
        accessorFn: (e) => e.projet?.client?.raison_sociale ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Client" />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'mois_concerne',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Mois concerné" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.mois_concerne}</span>
        ),
      },
      {
        accessorKey: 'montant_prevu_ht',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Montant HT"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <span className="font-mono text-sm tabular-nums">
              {formatCurrency(row.original.montant_prevu_ht)}
            </span>
          </div>
        ),
      },
      {
        id: 'montant_prevu_ttc',
        accessorFn: (e) =>
          htToTtc(
            e.montant_prevu_ht,
            resolveTvaRegime(e.projet?.client?.tva_intracommunautaire).taux /
              100,
          ),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Montant TTC"
            className="justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <span className="font-mono text-sm tabular-nums">
              {formatCurrency(
                htToTtc(
                  row.original.montant_prevu_ht,
                  resolveTvaRegime(
                    row.original.projet?.client?.tva_intracommunautaire,
                  ).taux / 100,
                ),
              )}
            </span>
          </div>
        ),
      },
    ],
    [onPreview],
  );

  function handleEmettre(selected: EcheancePending[], clear: () => void) {
    startTransition(async () => {
      const result = await createFactures(selected.map((e) => e.id));
      if (result.success) {
        toast.success(
          `${result.ids.length} brouillon${result.ids.length > 1 ? 's' : ''} créé${result.ids.length > 1 ? 's' : ''}. À vérifier puis envoyer dans l’onglet Brouillons.`,
        );
        clear();
      } else {
        toast.error(result.error ?? 'Erreur lors de la création');
      }
    });
  }

  return (
    <DataTable
      columns={columns}
      data={echeances}
      searchPlaceholder="Rechercher une échéance..."
      emptyMessage="Aucune échéance à facturer."
      enableRowSelection
      getRowId={(e) => e.id}
      renderBulkActions={(selected, clear) => {
        const total = selected.reduce((sum, e) => sum + e.montant_prevu_ht, 0);
        return (
          <>
            <span className="text-muted-foreground text-sm">
              Total :{' '}
              <span className="text-foreground font-medium tabular-nums">
                {formatCurrency(total)} HT
              </span>
            </span>
            <Button
              aria-label="Préparer brouillons"
              disabled={isPending}
              onClick={() => handleEmettre(selected, clear)}
            >
              {isPending ? 'Préparation en cours...' : 'Préparer brouillons'}
            </Button>
          </>
        );
      }}
    />
  );
}
