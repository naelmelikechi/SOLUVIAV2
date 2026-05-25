'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import type { FactureListItem } from '@/lib/queries/factures';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatCurrency,
  formatDate,
  formatMoisConcerne,
} from '@/lib/utils/formatters';
import {
  STATUT_FACTURE_LABELS,
  STATUT_FACTURE_COLORS,
} from '@/lib/utils/constants';
import { textFilterFn } from '@/lib/utils/table-filters';

export function createFactureListColumns(
  onPreview: (ref: string) => void,
): ColumnDef<FactureListItem>[] {
  return [
    {
      id: 'actions',
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 48,
      cell: ({ row }) => {
        const ref = row.original.ref;
        if (!ref) return null;
        return (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Aperçu PDF"
            title="Aperçu PDF"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(ref);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        );
      },
    },
    {
      accessorKey: 'ref',
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="N° Facture"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-bold text-[var(--warning)]">
          {row.original.ref}
        </span>
      ),
    },
    {
      id: 'projet',
      accessorFn: (row) => row.projet?.ref ?? '',
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Projet"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => {
        const ref = row.original.projet?.ref;
        if (!ref) {
          return (
            <span className="text-muted-foreground text-xs italic">Libre</span>
          );
        }
        return <ProjectRef ref_={ref} />;
      },
    },
    {
      id: 'client',
      accessorFn: (row) => row.client?.raison_sociale ?? '',
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Client"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.client?.raison_sociale ?? ''}
        </span>
      ),
    },
    {
      id: 'type',
      header: () => (
        <span className="text-xs font-semibold tracking-wider uppercase">
          Type
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 80,
      cell: ({ row }) => {
        const isProjet = row.original.projet !== null;
        return (
          <Badge variant={isProjet ? 'outline' : 'secondary'}>
            {isProjet ? 'Projet' : 'Libre'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'date_emission',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Émission" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.date_emission
            ? formatDate(row.original.date_emission)
            : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'mois_concerne',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Mois" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {formatMoisConcerne(row.original.mois_concerne)}
        </span>
      ),
    },
    {
      accessorKey: 'montant_ht',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Montant HT" />
      ),
      cell: ({ row }) => {
        const { montant_ht, est_avoir } = row.original;
        return (
          <span
            className={`text-right font-mono text-sm tabular-nums ${est_avoir ? 'text-[var(--destructive)]' : ''}`}
          >
            {formatCurrency(montant_ht)}
          </span>
        );
      },
    },
    {
      accessorKey: 'date_echeance',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Échéance" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.date_echeance
            ? formatDate(row.original.date_echeance)
            : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'statut',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="État" />
      ),
      cell: ({ row }) => {
        const statut = row.original.statut;
        return (
          <StatusBadge
            label={STATUT_FACTURE_LABELS[statut] || statut}
            color={STATUT_FACTURE_COLORS[statut] || 'gray'}
          />
        );
      },
      filterFn: textFilterFn,
    },
  ];
}
