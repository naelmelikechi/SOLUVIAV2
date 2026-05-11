'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { textFilterFn } from '@/lib/utils/table-filters';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_PROSPECT_LABELS,
  type StageProspect,
  type TypeProspect,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import type { ProspectWithCommercial } from '@/lib/queries/prospects';

interface PipelineTableProps {
  prospects: ProspectWithCommercial[];
  onRowClick: (p: ProspectWithCommercial) => void;
}

export function PipelineTable({ prospects, onRowClick }: PipelineTableProps) {
  const columns = useMemo<ColumnDef<ProspectWithCommercial>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Prospect"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nom}</span>
        ),
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'region',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Region"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => row.original.region ?? '-',
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'type_prospect',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) =>
          row.original.type_prospect
            ? TYPE_PROSPECT_LABELS[row.original.type_prospect as TypeProspect]
            : '-',
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Stage" />
        ),
        cell: ({ row }) => {
          const stage = row.original.stage as StageProspect;
          return (
            <StatusBadge
              label={STAGE_PROSPECT_LABELS[stage] ?? stage}
              color={STAGE_PROSPECT_COLORS[stage] ?? 'gray'}
            />
          );
        },
      },
      {
        accessorKey: 'volume_apprenants',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Volume" />
        ),
        cell: ({ row }) =>
          row.original.volume_apprenants != null
            ? row.original.volume_apprenants.toLocaleString('fr-FR')
            : '-',
      },
      {
        id: 'commercial',
        accessorFn: (row) =>
          row.commercial
            ? `${row.commercial.prenom} ${row.commercial.nom}`
            : '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Commercial"
            filterVariant="text"
          />
        ),
        cell: ({ row }) =>
          row.original.commercial
            ? `${row.original.commercial.prenom} ${row.original.commercial.nom}`
            : '-',
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'updated_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Mis a jour" />
        ),
        cell: ({ row }) =>
          row.original.updated_at ? formatDate(row.original.updated_at) : '-',
      },
    ],
    [],
  );

  return (
    <DataTable columns={columns} data={prospects} onRowClick={onRowClick} />
  );
}
