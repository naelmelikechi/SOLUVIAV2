'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import type { BadgeColor } from '@/components/shared/status-badge';
import type { UserListItem } from '@/lib/queries/users';
import { formatDateLong } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';

const roleBadge: Record<string, { label: string; color: BadgeColor }> = {
  admin: { label: 'Admin', color: 'purple' },
  cdp: { label: 'CDP', color: 'blue' },
};

export function getUserListColumns(
  onEdit: (user: UserListItem) => void,
): ColumnDef<UserListItem>[] {
  return [
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
        const badge = roleBadge[row.original.role] ?? {
          label: row.original.role,
          color: 'gray' as const,
        };
        return <StatusBadge label={badge.label} color={badge.color} />;
      },
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
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row.original);
          }}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Modifier
        </Button>
      ),
    },
  ];
}
