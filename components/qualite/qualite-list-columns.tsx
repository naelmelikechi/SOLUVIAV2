'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { QualiteSummary } from '@/lib/queries/qualite';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';

export const qualiteListColumns: ColumnDef<QualiteSummary>[] = [
  {
    accessorKey: 'projet.ref',
    id: 'ref',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.projet.ref ?? ''} />,
  },
  {
    accessorKey: 'projet.client.raison_sociale',
    id: 'client',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.projet.client?.raison_sociale}
      </span>
    ),
  },
  {
    accessorKey: 'projet.cdp.prenom',
    id: 'cdp',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.projet.cdp?.prenom} {row.original.projet.cdp?.nom}
      </span>
    ),
  },
  {
    accessorKey: 'pct',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Progression" />
    ),
    cell: ({ row }) => {
      const pct = row.original.pct;
      const color =
        pct >= 80
          ? 'bg-primary'
          : pct >= 50
            ? 'bg-[var(--warning)]'
            : 'bg-[var(--destructive)]';
      return (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--border-light)]">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums">{pct}%</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'terminees',
    id: 'livrables',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Livrables" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        <span className="text-primary font-medium">
          {row.original.terminees}
        </span>
        <span className="text-muted-foreground"> / {row.original.total}</span>
      </span>
    ),
  },
  {
    accessorKey: 'famillesConformes',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Familles conformes" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.famillesConformes}/{row.original.totalFamilles}
      </span>
    ),
  },
  {
    accessorKey: 'statutGlobal',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => {
      const isConforme = row.original.statutGlobal === 'conforme';
      return (
        <StatusBadge
          label={isConforme ? 'Conforme' : 'Non conforme'}
          color={isConforme ? 'green' : 'red'}
        />
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
];
