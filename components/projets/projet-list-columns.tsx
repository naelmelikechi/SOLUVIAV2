'use client';

import type { ColumnDef, FilterFn, Row } from '@tanstack/react-table';
import Link from 'next/link';
import type { ProjetListEnriched } from '@/lib/queries/projets';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatCurrency, formatHeures } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import { matchesSearch } from '@/lib/utils/search';

const textFilterFn: FilterFn<ProjetListEnriched> = (
  row: Row<ProjetListEnriched>,
  columnId: string,
  filterValue: unknown,
) => {
  const cell = row.getValue(columnId);
  if (cell == null) return false;
  // Toolbar multi-select passes an array of allowed values - keep array semantic
  if (Array.isArray(filterValue)) {
    return filterValue.length === 0 || filterValue.includes(cell);
  }
  // Header text search passes a string
  if (typeof filterValue === 'string') {
    return matchesSearch(String(cell), filterValue);
  }
  return false;
};

export const projetListColumns: ColumnDef<ProjetListEnriched>[] = [
  {
    accessorKey: 'ref',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° Projet" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.ref ?? ''} />,
  },
  {
    id: 'client',
    accessorFn: (row) => row.client?.raison_sociale ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Client"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => {
      const client = row.original.client;
      if (!client)
        return <span className="text-muted-foreground text-sm">-</span>;
      return (
        <Link
          href={`/admin/clients/${client.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm hover:underline"
        >
          {client.raison_sociale}
        </Link>
      );
    },
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    id: 'cdp',
    accessorFn: (row) => (row.cdp ? `${row.cdp.prenom} ${row.cdp.nom}` : ''),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" filterVariant="text" />
    ),
    cell: ({ row }) => {
      const cdp = row.original.cdp;
      if (!cdp) return <span className="text-muted-foreground text-sm">-</span>;
      return (
        <Link
          href="/admin/utilisateurs"
          onClick={(e) => e.stopPropagation()}
          className="text-sm hover:underline"
          title={`${cdp.prenom} ${cdp.nom}`}
        >
          {cdp.prenom} {cdp.nom}
        </Link>
      );
    },
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    accessorKey: 'statut',
    enableHiding: false,
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
    accessorFn: (row) => row.typologie?.code ?? '',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Typologie"
        filterVariant="text"
      />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.typologie?.libelle}</span>
    ),
    enableColumnFilter: true,
    filterFn: textFilterFn,
  },
  {
    accessorKey: 'taux_commission',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Commission" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/projets/${row.original.ref}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm tabular-nums hover:underline"
      >
        {row.original.taux_commission}%
      </Link>
    ),
  },
  {
    accessorKey: 'apprentisActifs',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprentis" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.apprentisActifs}
      </span>
    ),
  },
  {
    accessorKey: 'facturesEnRetard',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fact. retard" />
    ),
    cell: ({ row }) => {
      const count = row.original.facturesEnRetard;
      if (count > 0) {
        return <StatusBadge label={String(count)} color="red" />;
      }
      return <span className="text-sm tabular-nums">0</span>;
    },
  },
  {
    accessorKey: 'encaissementsEnRetard',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Enc. retard" />
    ),
    cell: ({ row }) => {
      const amount = row.original.encaissementsEnRetard;
      return (
        <span
          className={`text-sm tabular-nums ${amount > 0 ? 'font-medium text-[var(--destructive)]' : ''}`}
        >
          {formatCurrency(amount)}
        </span>
      );
    },
  },
  {
    accessorKey: 'tempsMois',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Temps" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {formatHeures(row.original.tempsMois)}
      </span>
    ),
  },
];
