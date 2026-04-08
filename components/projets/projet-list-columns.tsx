'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ProjetListItem } from '@/lib/queries/projets';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';

export const projetListColumns: ColumnDef<ProjetListItem>[] = [
  {
    accessorKey: 'ref',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.ref ?? ''} />,
  },
  {
    id: 'client',
    accessorFn: (row) => row.client?.raison_sociale,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.client?.raison_sociale}</span>
    ),
  },
  {
    id: 'cdp',
    accessorFn: (row) => row.cdp?.prenom,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.cdp
          ? `${row.original.cdp.prenom} ${row.original.cdp.nom}`
          : '—'}
      </span>
    ),
  },
  {
    accessorKey: 'statut',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => {
      const statut = row.original.statut;
      return (
        <StatusBadge
          label={STATUT_PROJET_LABELS[statut] || statut}
          color={STATUT_PROJET_COLORS[statut] || 'gray'}
        />
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: 'typologie',
    accessorFn: (row) => row.typologie?.libelle,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Typologie" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.typologie?.libelle}</span>
    ),
  },
  {
    accessorKey: 'taux_commission',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Commission" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.taux_commission}%
      </span>
    ),
  },
];
