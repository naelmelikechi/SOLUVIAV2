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
      <DataTableColumnHeader column={column} title="Complétion" />
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
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Terminées" />
    ),
    cell: ({ row }) => (
      <span className="text-primary text-sm font-medium tabular-nums">
        {row.original.terminees}
      </span>
    ),
  },
  {
    accessorKey: 'a_realiser',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="À réaliser" />
    ),
    cell: ({ row }) => {
      const count = row.original.a_realiser;
      return (
        <span
          className={`text-sm tabular-nums ${count > 0 ? 'font-medium text-[var(--warning)]' : ''}`}
        >
          {count}
        </span>
      );
    },
  },
  {
    accessorKey: 'famillesConformes',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Familles" />
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
