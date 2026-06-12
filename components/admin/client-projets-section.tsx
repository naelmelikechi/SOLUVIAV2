'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { FolderOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import type { ClientProjet } from '@/lib/queries/clients';
import { CommissionRateBadge } from '@/components/projets/commission-rate-badge';

const columns: ColumnDef<ClientProjet>[] = [
  {
    accessorKey: 'ref',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ref" />
    ),
    cell: ({ row }) => <ProjectRef ref_={row.original.ref ?? ''} />,
  },
  {
    id: 'typologie',
    accessorFn: (p) => p.typologie?.libelle ?? '-',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Typologie" />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue<string>()}</span>
    ),
  },
  {
    id: 'cdp',
    accessorFn: (p) => (p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '-'),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="CDP" />
    ),
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'taux_commission',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Commission" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        <CommissionRateBadge
          projetId={row.original.id}
          initialValue={row.original.taux_commission}
          canEdit
        />
      </span>
    ),
  },
  {
    id: 'statut',
    accessorFn: (p) => STATUT_PROJET_LABELS[p.statut] || p.statut,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        label={STATUT_PROJET_LABELS[row.original.statut] || row.original.statut}
        color={STATUT_PROJET_COLORS[row.original.statut] || 'gray'}
      />
    ),
  },
];

export function ClientProjetsSection({ projets }: { projets: ClientProjet[] }) {
  return (
    <Card className="mb-6 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <FolderOpen className="size-4" /> Projets associés
        <span className="text-muted-foreground text-xs font-normal">
          ({projets.length})
        </span>
      </h3>
      {projets.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun projet</p>
      ) : (
        <DataTable
          columns={columns}
          data={projets}
          searchPlaceholder="Rechercher un projet..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
        />
      )}
    </Card>
  );
}
