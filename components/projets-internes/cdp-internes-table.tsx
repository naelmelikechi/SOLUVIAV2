'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import type { CdpStats } from '@/lib/queries/projets-internes';

function formatHeures(h: number): string {
  return `${h.toFixed(1).replace('.', ',')} h`;
}

const columns: ColumnDef<CdpStats>[] = [
  {
    id: 'collaborateur',
    accessorFn: (row) => `${row.prenom} ${row.nom}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Collaborateur" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.prenom} {row.original.nom}
      </span>
    ),
  },
  {
    accessorKey: 'heuresInternes',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Heures internes"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {formatHeures(row.original.heuresInternes)}
      </div>
    ),
  },
  {
    accessorKey: 'heuresClient',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Heures client"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-muted-foreground text-right tabular-nums">
        {formatHeures(row.original.heuresClient)}
      </div>
    ),
  },
  {
    accessorKey: 'ratio',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Ratio interne"
        className="justify-end"
      />
    ),
    cell: ({ row }) => {
      const ratio = row.original.ratio;
      return (
        <div className="text-right tabular-nums">
          {ratio !== null ? (
            <span
              className={cn(
                'font-semibold',
                ratio >= 40
                  ? 'text-amber-700'
                  : ratio >= 25
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {ratio.toFixed(1).replace('.', ',')}%
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      );
    },
  },
];

interface Props {
  data: CdpStats[];
}

export function CdpInternesTable({ data }: Props) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Rechercher un collaborateur..."
      paginationMode="auto"
      initialPageSize={10}
      emptyMessage="Aucune saisie temps sur la période"
    />
  );
}
