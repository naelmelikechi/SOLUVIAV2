'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ContratNonFacture } from '@/lib/queries/contrats-a-facturer';
import { OPCO_NON_RESOLU } from '@/lib/opco/resolve';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/shared/status-badge';
import { DataTableColumnHeader } from '@/components/shared/data-table';

export const supervisionColumns: ColumnDef<ContratNonFacture>[] = [
  {
    id: 'contrat',
    accessorFn: (c) => [c.contractNumber, c.ref].filter(Boolean).join(' '),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° contrat" />
    ),
    cell: ({ row }) => (
      <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
        {row.original.contractNumber ?? row.original.ref ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'apprenti',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprenti" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.apprenti || '—'}</span>
    ),
  },
  {
    accessorKey: 'projetRef',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Projet" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.projetRef ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'cdpNom',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.cdpNom ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'clientRaisonSociale',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.clientRaisonSociale ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'opco',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="OPCO" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        label={row.original.opco}
        color={row.original.opco === OPCO_NON_RESOLU ? 'gray' : 'blue'}
      />
    ),
  },
  {
    accessorKey: 'nonTransmisCount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Éch. non transmises" />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.nonTransmisCount}</span>
    ),
  },
  {
    id: 'prochaine',
    accessorFn: (c) => c.prochaineEcheance,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Prochaine échéance" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{formatDate(c.prochaineEcheance)}</span>
          {c.statut === 'echu' ? (
            <StatusBadge
              label={
                c.retardJours === 0
                  ? 'aujourd’hui'
                  : `retard ${c.retardJours} j`
              }
              color="red"
            />
          ) : (
            <StatusBadge label="à venir" color="blue" />
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'montantNonTransmis',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Montant non transmis" />
    ),
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {formatCurrency(row.original.montantNonTransmis)}
      </span>
    ),
  },
];
