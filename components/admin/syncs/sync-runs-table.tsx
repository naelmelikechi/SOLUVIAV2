'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import type { RecentSyncRun } from '@/lib/queries/syncs';
import { formatDureeMs, formatHorodatage } from './format';

const STATUT_BADGES: Record<string, { label: string; color: BadgeColor }> = {
  success: { label: 'Succès', color: 'green' },
  partial: { label: 'Partiel', color: 'orange' },
  error: { label: 'Erreur', color: 'red' },
};

/** Resume des compteurs d'un run reussi (affiche quand il n'y a pas d'erreur). */
function statsSummary(run: RecentSyncRun): string {
  const s = run.stats;
  if (!s) return '-';
  return `${s.contrats ?? 0} contrats, ${s.apprenants ?? 0} apprenants, ${s.invoice_lines ?? 0} lignes de facture`;
}

const columns: ColumnDef<RecentSyncRun>[] = [
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Horodatage" />
    ),
    cell: ({ row }) => (
      // suppressHydrationWarning : l'heure est rendue dans le fuseau local,
      // qui peut differer entre le serveur (UTC) et le navigateur.
      <span className="text-sm whitespace-nowrap" suppressHydrationWarning>
        {formatHorodatage(row.original.created_at)}
      </span>
    ),
  },
  {
    accessorKey: 'clientNom',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Client" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium">{row.original.clientNom}</span>
    ),
  },
  {
    accessorKey: 'statut',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => {
      const badge = STATUT_BADGES[row.original.statut] ?? {
        label: row.original.statut,
        color: 'gray' as const,
      };
      return <StatusBadge label={badge.label} color={badge.color} />;
    },
  },
  {
    accessorKey: 'duration_ms',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Durée" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {formatDureeMs(row.original.duration_ms)}
      </span>
    ),
  },
  {
    id: 'details',
    header: 'Détails',
    cell: ({ row }) => {
      const { erreur } = row.original;
      if (erreur) {
        return (
          <span
            className="text-destructive line-clamp-2 max-w-[32rem] text-xs"
            title={erreur}
          >
            {erreur}
          </span>
        );
      }
      return (
        <span className="text-muted-foreground text-xs">
          {statsSummary(row.original)}
        </span>
      );
    },
  },
];

export function SyncRunsTable({ data }: { data: RecentSyncRun[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Rechercher un client, un statut..."
      defaultSort={{ id: 'created_at', desc: true }}
    />
  );
}
