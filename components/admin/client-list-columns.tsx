'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { MOCK_PROJETS, type MockClient } from '@/lib/mock-data';

export interface ClientListRow extends MockClient {
  nb_projets: number;
}

export function buildClientListData(clients: MockClient[]): ClientListRow[] {
  return clients.map((c) => ({
    ...c,
    nb_projets: MOCK_PROJETS.filter((p) => p.client.id === c.id).length,
  }));
}

export const clientListColumns: ColumnDef<ClientListRow>[] = [
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
  {
    accessorKey: 'nb_projets',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Projets" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.nb_projets}</span>
    ),
  },
];
