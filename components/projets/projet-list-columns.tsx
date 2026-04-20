'use client';

import type { ColumnDef } from '@tanstack/react-table';
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
    accessorFn: (row) => row.client?.raison_sociale,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
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
  },
  {
    id: 'cdp',
    accessorFn: (row) => row.cdp?.prenom,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
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
    accessorFn: (row) => row.typologie?.code,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Typologie" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.typologie?.libelle}</span>
    ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
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
    accessorKey: 'tachesARealiser',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tâches" />
    ),
    cell: ({ row }) => {
      const count = row.original.tachesARealiser;
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
