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
import { seuilCharge } from '@/lib/utils/cdp-scoring';
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
        meta: { label: 'Clients', aggregate: 'sum' },
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
        meta: { label: 'Projets actifs', aggregate: 'sum' },
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
        meta: { label: 'Alternants', aggregate: 'sum' },
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
        meta: {
          label: 'Capacité',
          aggregate: 'avg',
          aggregateFormat: (v) => `${Math.round(v)} %`,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Capacité" />
        ),
        cell: ({ row }) => {
          // Seuils spec F7 §4 : orange >= 80 %, rouge >= 95 % (ou saturation
          // déclarée par le CDP).
          const seuil = seuilCharge(
            row.original.score.ratio,
            row.original.disponibilite,
          );
          return (
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                {row.original.score.charge} %
              </span>
              {seuil === 95 ? (
                <StatusBadge label="Saturé" color="red" />
              ) : seuil === 80 ? (
                <StatusBadge label="Chargé" color="orange" />
              ) : null}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={lines}
      searchPlaceholder="Rechercher un CDP..."
      defaultSort={{ id: 'capacite', desc: false }}
      onRowClick={(row) => router.push(`/commercial/cdp?cdp=${row.cdp.id}`)}
      emptyMessage="Aucun chef de projet référent."
    />
  );
}
