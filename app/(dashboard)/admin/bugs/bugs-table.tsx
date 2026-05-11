'use client';

import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
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

export function BugsTable({ reports }: { reports: BugReportRow[] }) {
  const router = useRouter();

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
  ];

  return (
    <DataTable
      columns={columns}
      data={reports}
      searchPlaceholder="Rechercher dans les bugs..."
      defaultSort={{ id: 'created_at', desc: true }}
      onRowClick={(row) => router.push(`/admin/bugs/${row.ref}`)}
    />
  );
}
