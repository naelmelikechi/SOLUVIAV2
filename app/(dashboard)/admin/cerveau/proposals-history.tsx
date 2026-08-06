'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { reopenProposalAction } from '@/lib/actions/brain-proposals';
import type { DecidedProposalRow } from '@/lib/queries/brain-proposals';
import type { ProposalKind } from '@/lib/brain/proposal';

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

// Fermé sur `ProposalKind`, comme la file d'arbitrage : un cinquième type
// oublié ici serait signalé par le compilateur plutôt que rendu en brut.
const KIND_LABEL: Record<ProposalKind, string> = {
  conversation: 'Réponse validée 👍',
  lacune: 'Lacune 👎',
  entite: 'Entité',
  obsolescence: 'Note obsolète',
};

const STATUS_VARIANT: Record<string, string> = {
  approuvee: 'bg-green-100 text-green-800',
  rejetee: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<string, string> = {
  approuvee: 'Approuvée',
  rejetee: 'Rejetée',
};

function ReopenAction({ proposal }: { proposal: DecidedProposalRow }) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();

  // Rien à rouvrir sur une approbation : la note est déjà dans le cerveau.
  if (proposal.status !== 'rejetee') return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
      title="Rouvrir (remettre dans la file à valider)"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await reopenProposalAction({ id: proposal.id });
          if (res.success) {
            toast.success('Proposition remise à valider');
            refresh();
          } else {
            toast.error(res.error ?? 'Échec');
          }
        })
      }
    >
      <RotateCcw className="size-4" />
    </Button>
  );
}

export function ProposalsHistory({ rows }: { rows: DecidedProposalRow[] }) {
  const columns: ColumnDef<DecidedProposalRow>[] = [
    {
      accessorKey: 'kind',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs">
          {KIND_LABEL[row.original.kind] ?? row.original.kind}
        </span>
      ),
    },
    {
      accessorKey: 'label',
      header: 'Proposition',
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-md text-sm">
          {row.original.label}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Décision',
      cell: ({ row }) => (
        <Badge className={STATUS_VARIANT[row.original.status] ?? ''}>
          {STATUS_LABEL[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Motif',
      cell: ({ row }) =>
        row.original.reason ? (
          <span className="line-clamp-2 max-w-xs text-xs">
            {row.original.reason}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        ),
    },
    {
      accessorKey: 'decided_by_name',
      header: 'Par',
      cell: ({ row }) => (
        <span className="text-xs">
          {/* FK ON DELETE SET NULL : l'arbitrage survit à son arbitre. */}
          {row.original.decided_by_name ?? 'Utilisateur supprimé'}
        </span>
      ),
    },
    {
      accessorKey: 'decided_at',
      header: 'Quand',
      cell: ({ row }) => {
        const value = row.original.decided_at;
        if (!value)
          return <span className="text-muted-foreground text-xs">-</span>;
        const d = new Date(value);
        return (
          <div className="text-muted-foreground text-xs">
            <div>{DATE_FMT.format(d)}</div>
            <div className="text-[10px] opacity-70">{TIME_FMT.format(d)}</div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <ReopenAction proposal={row.original} />,
      enableSorting: false,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Rechercher dans l'historique..."
      defaultSort={{ id: 'decided_at', desc: true }}
      emptyMessage="Aucune proposition arbitrée pour l'instant."
    />
  );
}
