'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { MockProjet } from '@/lib/mock-data';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatCurrency, formatHeures } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';

export const projetListColumns: ColumnDef<MockProjet>[] = [
  {
    accessorKey: 'ref',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.ref} />,
  },
  {
    accessorKey: 'client.raison_sociale',
    id: 'client',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.client.raison_sociale}</span>
    ),
  },
  {
    accessorKey: 'cdp.prenom',
    id: 'cdp',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.cdp.prenom} {row.original.cdp.nom}
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
    accessorKey: 'apprentis_actifs',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprentis" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.apprentis_actifs}
      </span>
    ),
  },
  {
    accessorKey: 'taches_a_realiser',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Taches" />
    ),
    cell: ({ row }) => {
      const count = row.original.taches_a_realiser;
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
    accessorKey: 'factures_en_retard',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fact. retard" />
    ),
    cell: ({ row }) => {
      const count = row.original.factures_en_retard;
      return (
        <span
          className={`text-sm tabular-nums ${count > 0 ? 'font-medium text-[var(--destructive)]' : ''}`}
        >
          {count}
        </span>
      );
    },
  },
  {
    accessorKey: 'encaissements_en_retard',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Enc. retard" />
    ),
    cell: ({ row }) => {
      const amount = row.original.encaissements_en_retard;
      return (
        <span
          className={`text-sm tabular-nums ${amount > 0 ? 'font-medium text-[var(--destructive)]' : ''}`}
        >
          {amount > 0 ? formatCurrency(amount) : '—'}
        </span>
      );
    },
  },
  {
    accessorKey: 'temps_mois_courant',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Temps" />
    ),
    cell: ({ row }) => {
      const h = row.original.temps_mois_courant;
      return (
        <span className="text-sm tabular-nums">
          {h > 0 ? formatHeures(h) : '—'}
        </span>
      );
    },
  },
];
