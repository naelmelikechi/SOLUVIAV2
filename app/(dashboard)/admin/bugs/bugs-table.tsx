'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { updateBugReportAction } from '@/lib/actions/bug-reports';
import type { BugReportRow } from '@/lib/queries/bug-reports';

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

const SEVERITY_VARIANT: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_VARIANT: Record<string, string> = {
  nouveau: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800',
  wontfix: 'bg-gray-100 text-gray-700',
};

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  resolu: 'Résolu',
  wontfix: 'Wontfix',
};

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Élevée',
  critical: 'Critique',
};

type BugStatus = 'nouveau' | 'en_cours' | 'resolu' | 'wontfix';

function isOpen(status: string): boolean {
  return status === 'nouveau' || status === 'en_cours';
}

function BugRowActions({ bug }: { bug: BugReportRow }) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();

  const updateStatus = (status: BugStatus, successMessage: string) => {
    startTransition(async () => {
      const res = await updateBugReportAction({
        id: bug.id,
        status,
        resolutionNotes: bug.resolution_notes ?? null,
      });
      if (res.success) {
        toast.success(successMessage);
        refresh();
      } else {
        toast.error(res.error ?? 'Erreur lors de la mise à jour');
      }
    });
  };

  if (isOpen(bug.status)) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-green-700 hover:bg-green-50 hover:text-green-800"
          title="Fermer (résolu)"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            updateStatus('resolu', 'Bug fermé');
          }}
        >
          <Check className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          title="Refuser (wontfix)"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            updateStatus('wontfix', 'Bug refusé');
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  // Bug fermé : Rouvrir + switch latéral résolu↔wontfix sans repasser
  // par nouveau (utile quand on requalifie un bug ferme).
  const lateralTarget: BugStatus =
    bug.status === 'resolu' ? 'wontfix' : 'resolu';
  const lateralLabel =
    lateralTarget === 'wontfix' ? 'Marquer wontfix' : 'Marquer résolu';
  const lateralToast = lateralTarget === 'wontfix' ? 'Bug refusé' : 'Bug fermé';
  const LateralIcon = lateralTarget === 'wontfix' ? X : Check;
  const lateralClasses =
    lateralTarget === 'wontfix'
      ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
      : 'text-green-700 hover:bg-green-50 hover:text-green-800';

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
        title="Rouvrir"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          updateStatus('nouveau', 'Bug rouvert');
        }}
      >
        <RotateCcw className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`size-7 ${lateralClasses}`}
        title={lateralLabel}
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          updateStatus(lateralTarget, lateralToast);
        }}
      >
        <LateralIcon className="size-4" />
      </Button>
    </div>
  );
}

export function BugsTable({ reports }: { reports: BugReportRow[] }) {
  const { push } = useRouter();

  const columns: ColumnDef<BugReportRow>[] = [
    {
      accessorKey: 'ref',
      header: 'Ref',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.ref}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => {
        const d = new Date(row.original.created_at);
        return (
          <div className="text-muted-foreground text-xs">
            <div>{DATE_FMT.format(d)}</div>
            <div className="text-[10px] opacity-70">{TIME_FMT.format(d)}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'user_email',
      header: 'Utilisateur',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{row.original.user_email}</span>
          <span className="text-muted-foreground text-xs">
            {row.original.user_role}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'ai_severity',
      header: 'Sévérité IA',
      cell: ({ row }) => {
        const sev = row.original.ai_severity;
        if (!sev)
          return <span className="text-muted-foreground text-xs">-</span>;
        return (
          <Badge className={SEVERITY_VARIANT[sev]}>
            {SEVERITY_LABEL[sev] ?? sev}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'ai_category',
      header: 'Catégorie',
      cell: ({ row }) => (
        <span className="text-xs capitalize">
          {row.original.ai_category ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'ai_summary',
      header: 'Résumé',
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-md text-xs">
          {row.original.ai_summary ?? row.original.comment.slice(0, 100)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => (
        <Badge className={STATUS_VARIANT[row.original.status] ?? ''}>
          {STATUS_LABEL[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <BugRowActions bug={row.original} />,
      enableSorting: false,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={reports}
      searchPlaceholder="Rechercher dans les bugs..."
      defaultSort={{ id: 'created_at', desc: true }}
      onRowClick={(row) => push(`/admin/bugs/${row.ref}`)}
    />
  );
}
