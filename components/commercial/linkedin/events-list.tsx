'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
  type FilterOption,
} from '@/components/shared/data-table';
import { textFilterFn } from '@/lib/utils/table-filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils/formatters';
import type { LinkedinEvent } from '@/lib/queries/linkedin';
import {
  TYPE_EVENEMENT_LINKEDIN_LABELS,
  STATUT_EVENEMENT_LINKEDIN_LABELS,
  STATUT_EVENEMENT_LINKEDIN_COLORS,
} from './linkedin-encart';

interface Props {
  events: LinkedinEvent[];
}

const STATUT_FILTERS: FilterOption[] = [
  {
    column: 'statut',
    label: 'Statut',
    options: [
      { label: STATUT_EVENEMENT_LINKEDIN_LABELS.nouveau, value: 'nouveau' },
      { label: STATUT_EVENEMENT_LINKEDIN_LABELS.traite, value: 'traite' },
      { label: STATUT_EVENEMENT_LINKEDIN_LABELS.ignore, value: 'ignore' },
      { label: STATUT_EVENEMENT_LINKEDIN_LABELS.erreur, value: 'erreur' },
    ],
  },
];

export function LinkedinEventsList({ events }: Props) {
  const columns = useMemo<ColumnDef<LinkedinEvent>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Capté le" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'type_evenement',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Évènement" />
        ),
        cell: ({ row }) =>
          TYPE_EVENEMENT_LINKEDIN_LABELS[row.original.type_evenement],
      },
      {
        accessorKey: 'linkedin_company_name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Entreprise"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.linkedin_company_name ?? '-'}
          </span>
        ),
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'prenom_nom',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Contact"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => row.original.prenom_nom ?? '-',
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'statut',
        meta: { label: 'Statut' },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Statut" />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={STATUT_EVENEMENT_LINKEDIN_LABELS[row.original.statut]}
            color={STATUT_EVENEMENT_LINKEDIN_COLORS[row.original.statut]}
          />
        ),
        filterFn: (row, id, value) => value.includes(row.getValue(id)),
      },
      {
        id: 'prospect',
        meta: { label: 'Prospect' },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Prospect" />
        ),
        cell: ({ row }) => {
          const prospect = row.original.prospect;
          if (!prospect) {
            return (
              <span className="text-muted-foreground">
                {row.original.raison_ignore ?? '-'}
              </span>
            );
          }
          return (
            <Link
              href={`/commercial/prospects/${prospect.id}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {prospect.nom}
            </Link>
          );
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={events}
      filters={STATUT_FILTERS}
      defaultSort={{ id: 'created_at', desc: true }}
      searchPlaceholder="Rechercher une entreprise, un contact..."
      emptyMessage="Aucun évènement LinkedIn capté pour le moment."
    />
  );
}
