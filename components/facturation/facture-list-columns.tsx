'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { FactureListItem } from '@/lib/queries/factures';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import {
  STATUT_FACTURE_LABELS,
  STATUT_FACTURE_COLORS,
} from '@/lib/utils/constants';

export const factureListColumns: ColumnDef<FactureListItem>[] = [
  {
    accessorKey: 'ref',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Facture" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm font-bold text-[var(--warning)]">
        {row.original.ref}
      </span>
    ),
  },
  {
    id: 'projet',
    accessorFn: (row) => row.projet?.ref,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.projet?.ref ?? ''} />,
  },
  {
    id: 'client',
    accessorFn: (row) => row.client?.raison_sociale,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.client?.raison_sociale ?? ''}
      </span>
    ),
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
          : '—'}
      </span>
    ),
  },
  {
    accessorKey: 'mois_concerne',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Mois" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.mois_concerne ?? ''}</span>
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
          : '—'}
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
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
];
