'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { textFilterFn } from '@/lib/utils/table-filters';
import { StatusBadge } from '@/components/shared/status-badge';
import { DISPO_CDP_LABELS, DISPO_CDP_COLORS } from '@/lib/utils/constants';
import type { CdpPlanLine } from '@/lib/queries/cdp';

interface PlanDeChargeTableProps {
  lines: CdpPlanLine[];
}

export function PlanDeChargeTable({ lines }: PlanDeChargeTableProps) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<CdpPlanLine>[]>(
    () => [
      {
        id: 'cdp',
        accessorFn: (row) => `${row.cdp.prenom} ${row.cdp.nom}`,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Chef de projet"
            filterVariant="text"
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.cdp.prenom} {row.original.cdp.nom}
          </span>
        ),
        filterFn: textFilterFn,
        enableColumnFilter: true,
      },
      {
        id: 'nbClients',
        accessorFn: (row) => row.nbClients,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Clients" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.nbClients}</span>
        ),
      },
      {
        id: 'nbProjetsActifs',
        accessorFn: (row) => row.nbProjetsActifs,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Projets actifs" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.nbProjetsActifs}</span>
        ),
      },
      {
        id: 'nbAlternants',
        accessorFn: (row) => row.nbAlternants,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Alternants" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.nbAlternants.toLocaleString('fr-FR')}
          </span>
        ),
      },
      {
        id: 'disponibilite',
        accessorFn: (row) => row.disponibilite ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Disponibilité" />
        ),
        cell: ({ row }) => {
          const d = row.original.disponibilite;
          if (!d) return <span className="text-muted-foreground">-</span>;
          return (
            <StatusBadge
              label={DISPO_CDP_LABELS[d]}
              color={DISPO_CDP_COLORS[d]}
            />
          );
        },
      },
      {
        id: 'capacite',
        accessorFn: (row) => row.score.charge,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Capacité" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{row.original.score.charge} %</span>
            {row.original.score.sature && (
              <StatusBadge label="Saturé" color="red" />
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={lines}
      defaultSort={{ id: 'capacite', desc: false }}
      onRowClick={(row) => router.push(`/commercial/cdp?cdp=${row.cdp.id}`)}
      emptyMessage="Aucun chef de projet référent."
    />
  );
}
