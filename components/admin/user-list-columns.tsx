'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import type { BadgeColor } from '@/components/shared/status-badge';
import type { UserListRow } from '@/lib/mock-data';
import { formatDateLong } from '@/lib/utils/formatters';

const roleBadge: Record<string, { label: string; color: BadgeColor }> = {
  admin: { label: 'Admin', color: 'purple' },
  cdp: { label: 'CDP', color: 'blue' },
};

export const userListColumns: ColumnDef<UserListRow>[] = [
  {
    accessorKey: 'nom',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nom" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium">
        {row.original.prenom} {row.original.nom}
      </span>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground font-mono text-sm">
        {row.original.email}
      </span>
    ),
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rôle" />
    ),
    cell: ({ row }) => {
      const badge = roleBadge[row.original.role];
      return <StatusBadge label={badge.label} color={badge.color} />;
    },
  },
  {
    accessorKey: 'nb_projets',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Projets" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.role === 'admin' ? '—' : row.original.nb_projets}
      </span>
    ),
  },
  {
    accessorKey: 'derniere_connexion',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dernière connexion" />
    ),
    cell: ({ row }) => {
      const date = row.original.derniere_connexion;
      return (
        <span className="text-muted-foreground text-sm">
          {date ? formatDateLong(date) : '—'}
        </span>
      );
    },
  },
  {
    accessorKey: 'actif',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        label={row.original.actif ? 'Actif' : 'Inactif'}
        color={row.original.actif ? 'green' : 'gray'}
      />
    ),
  },
];
