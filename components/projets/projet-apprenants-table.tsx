'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, GraduationCap } from 'lucide-react';
import type { ApprenantProjetRow } from '@/lib/queries/apprenants';
import { formatDate } from '@/lib/utils/formatters';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { isApprenantEnAlerte } from '@/lib/utils/apprenant-alerte';
import {
  getContratStateColor,
  getContratStateLabel,
} from '@/lib/utils/contrat-states';
import { cn } from '@/lib/utils';

function statutLabel(row: ApprenantProjetRow): string {
  if (row.source === 'sans_contrat') return 'Sans contrat';
  return getContratStateLabel(row.contract_state);
}

function statutColor(row: ApprenantProjetRow): BadgeColor {
  if (row.source === 'sans_contrat') return 'orange';
  return getContratStateColor(row.contract_state);
}

function enAlerte(row: ApprenantProjetRow): boolean {
  return isApprenantEnAlerte(row.date_debut, row.contract_state);
}

const columns: ColumnDef<ApprenantProjetRow>[] = [
  {
    id: 'apprenant',
    accessorFn: (a) => `${a.prenom} ${a.nom}`.trim(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprenant" />
    ),
    cell: ({ row }) => {
      const a = row.original;
      const alerte = enAlerte(a);
      const nom = `${a.prenom} ${a.nom}`.trim() || '-';
      if (!alerte) return <span className="text-sm">{nom}</span>;
      return (
        <Tooltip>
          <TooltipTrigger className="flex cursor-default items-center gap-1.5 text-left">
            <AlertTriangle className="size-3.5 shrink-0 text-[var(--danger)]" />
            <span className="text-sm font-medium text-[var(--danger)]">
              {nom}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs px-3 py-2">
            <p className="text-xs">
              Formation démarrée le{' '}
              {a.date_debut ? formatDate(a.date_debut) : '-'} mais contrat non
              engagé côté Eduvia ({statutLabel(a)}).
            </p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'formation_titre',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Formation" />
    ),
    cell: ({ row }) => {
      const titre = row.original.formation_titre;
      if (!titre)
        return <span className="text-muted-foreground text-sm">-</span>;
      return (
        <Tooltip>
          <TooltipTrigger className="block max-w-[220px] cursor-default truncate text-left text-sm">
            {titre}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm px-3 py-2">
            <span className="text-sm">{titre}</span>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'contract_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="N° contrat" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.contract_number ?? '-'}
      </span>
    ),
  },
  {
    accessorKey: 'date_debut',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Début" />
    ),
    cell: ({ row }) => {
      const a = row.original;
      return (
        <span
          className={cn(
            'text-sm tabular-nums',
            enAlerte(a) && 'font-medium text-[var(--danger)]',
          )}
        >
          {a.date_debut ? formatDate(a.date_debut) : '-'}
        </span>
      );
    },
  },
  {
    accessorKey: 'date_fin',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fin" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.date_fin ? formatDate(row.original.date_fin) : '-'}
      </span>
    ),
  },
  {
    id: 'statut',
    accessorFn: (a) => statutLabel(a),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        label={statutLabel(row.original)}
        color={statutColor(row.original)}
      />
    ),
  },
];

export function ProjetApprenantsTable({
  apprenants,
}: {
  apprenants: ApprenantProjetRow[];
}) {
  const nbAlertes = apprenants.filter(enAlerte).length;
  const nbSansContrat = apprenants.filter(
    (a) => a.source === 'sans_contrat',
  ).length;

  return (
    <TooltipProvider delay={200}>
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="size-4" /> Apprenants
            </h3>
            <StatusBadge label="Eduvia" color="orange" />
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            {nbAlertes > 0 && (
              <span className="flex items-center gap-1.5 text-[var(--danger)]">
                <AlertTriangle className="size-3.5" />
                {nbAlertes} contrat{nbAlertes > 1 ? 's' : ''} non engagé
                {nbAlertes > 1 ? 's' : ''} malgré une formation démarrée
              </span>
            )}
            {nbSansContrat > 0 && <span>{nbSansContrat} sans contrat</span>}
            <span>
              {apprenants.length} apprenant{apprenants.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {apprenants.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun apprenant synchronisé
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={apprenants}
            searchPlaceholder="Rechercher un apprenant..."
            paginationMode="auto"
            emptyMessage="Aucun résultat."
          />
        )}
      </Card>
    </TooltipProvider>
  );
}
