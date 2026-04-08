'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ClientListItem } from '@/lib/queries/clients';
import { DataTableColumnHeader } from '@/components/shared/data-table';

export const clientListColumns: ColumnDef<ClientListItem>[] = [
  {
    accessorKey: 'trigramme',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Trigramme" />
    ),
    cell: ({ row }) => (
      <span className="text-primary inline-block rounded bg-[var(--primary-bg)] px-2 py-0.5 font-mono text-xs font-semibold">
        {row.original.trigramme}
      </span>
    ),
  },
  {
    accessorKey: 'raison_sociale',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Raison sociale" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium">{row.original.raison_sociale}</span>
    ),
  },
  {
    accessorKey: 'siret',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SIRET" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground font-mono text-sm">
        {row.original.siret}
      </span>
    ),
  },
  {
    accessorKey: 'localisation',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Localisation" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.localisation}</span>
    ),
  },
];
