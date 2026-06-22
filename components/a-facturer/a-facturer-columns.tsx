'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ContratAFacturer } from '@/lib/queries/contrats-a-facturer';
import { OPCO_NON_RESOLU } from '@/lib/opco/resolve';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/components/shared/data-table';

export const aFacturerColumns: ColumnDef<ContratAFacturer>[] = [
  {
    id: 'contrat',
    accessorFn: (c) => [c.contractNumber, c.ref].filter(Boolean).join(' '),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° contrat" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      return (
        <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
          {c.contractNumber ?? c.ref ?? '—'}
        </span>
      );
    },
  },
  {
    id: 'apprenti',
    accessorKey: 'apprenti',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprenti" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.apprenti || '—'}</span>
    ),
  },
  {
    accessorKey: 'formationTitre',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Formation" />
    ),
    cell: ({ row }) => {
      const titre = row.original.formationTitre;
      if (!titre) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="max-w-[200px] text-sm">
          <Tooltip>
            <TooltipTrigger className="block max-w-full cursor-default truncate text-left">
              {titre}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm px-3 py-2">
              <span className="text-sm font-semibold">{titre}</span>
            </TooltipContent>
          </Tooltip>
        </div>
      );
    },
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
    cell: ({ row }) => {
      const opco = row.original.opco;
      return (
        <StatusBadge
          label={opco}
          color={opco === OPCO_NON_RESOLU ? 'gray' : 'blue'}
        />
      );
    },
  },
  {
    id: 'echeance',
    accessorFn: (c) => c.openingDate,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Échéance due" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">
            Étape {c.stepNumber} · {formatDate(c.openingDate)}
            {c.echeancesDuesCount > 1 && (
              <span className="text-muted-foreground ml-1">
                (+{c.echeancesDuesCount - 1})
              </span>
            )}
          </span>
          <StatusBadge
            label={
              c.retardJours === 0 ? 'aujourd’hui' : `retard ${c.retardJours} j`
            }
            color={c.retardJours === 0 ? 'orange' : 'red'}
          />
        </div>
      );
    },
  },
  {
    accessorKey: 'montant',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Montant" />
    ),
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {row.original.montant != null
          ? formatCurrency(row.original.montant)
          : '—'}
      </span>
    ),
  },
];
