'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type {
  RafContratRow,
  RafProjetRow,
  RafOpcoRow,
  RafLockReason,
} from '@/lib/utils/reste-a-facturer';
import { DataTableColumnHeader } from '@/components/shared/data-table';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { formatCurrency } from '@/lib/utils/formatters';
import { textFilterFn } from '@/lib/utils/table-filters';
import { cn } from '@/lib/utils';

const STATE_LABELS: Record<string, string> = {
  ENGAGE: 'Engagé',
  EN_COURS_INSTRUCTION: 'En instruction',
  TRANSMIS: 'Transmis',
  NOTSENT: 'Non transmis',
  actif: 'Actif',
  resilie: 'Résilié',
  ANNULE: 'Annulé',
  termine: 'Terminé',
  suspendu: 'Suspendu',
};

const STATE_COLORS: Record<string, BadgeColor> = {
  ENGAGE: 'green',
  EN_COURS_INSTRUCTION: 'blue',
  TRANSMIS: 'blue',
  NOTSENT: 'gray',
  actif: 'green',
  resilie: 'red',
  ANNULE: 'red',
  termine: 'gray',
  suspendu: 'orange',
};

const LOCK_LABELS: Record<RafLockReason, string> = {
  missing_idcc: 'IDCC manquant',
  unknown_opco: 'OPCO inconnu',
  unknown_line_type: 'Type OPCO inconnu',
  opposite_billed: 'Exclusion engagement / OPCO',
  verrouille_manuel: 'Verrouillé manuellement',
};

function MoneyCell({
  value,
  tone,
}: {
  value: number;
  tone?: 'facturable' | 'attente' | 'bloque' | 'previsionnel';
}) {
  if (value <= 0) {
    return (
      <div className="text-muted-foreground/40 text-right font-mono text-sm tabular-nums">
        -
      </div>
    );
  }
  return (
    <div
      className={cn(
        'text-right font-mono text-sm font-semibold tabular-nums',
        tone === 'facturable' && 'text-[var(--success)]',
        tone === 'attente' && 'text-[var(--info)]',
        tone === 'bloque' && 'text-[var(--warning)]',
        tone === 'previsionnel' && 'text-muted-foreground font-normal',
      )}
    >
      {formatCurrency(value)}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  return (
    <StatusBadge
      label={STATE_LABELS[state] ?? state}
      color={STATE_COLORS[state] ?? 'gray'}
    />
  );
}

export function createContratColumns(): ColumnDef<RafContratRow>[] {
  return [
    {
      id: 'contrat',
      accessorFn: (r) =>
        `${r.contractNumber ?? r.contratRef ?? ''} ${r.apprenant}`.trim(),
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Contrat"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[11px]">
              {r.contractNumber ?? r.contratRef ?? '-'}
            </span>
            <span className="text-sm">{r.apprenant || '-'}</span>
            {r.formationTitre ? (
              <span className="text-muted-foreground text-[10px]">
                {r.formationTitre}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'projet',
      accessorFn: (r) => r.projetRef,
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Projet"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => <ProjectRef ref_={row.original.projetRef} />,
    },
    {
      id: 'client',
      accessorFn: (r) => r.client,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client" />
      ),
      cell: ({ row }) => <span className="text-sm">{row.original.client}</span>,
    },
    {
      id: 'opco',
      accessorFn: (r) => r.opcoNom ?? 'Non résolu',
      enableColumnFilter: true,
      filterFn: textFilterFn,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="OPCO"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => (
        <span
          className={cn(
            'text-sm',
            !row.original.opcoCode && 'text-muted-foreground italic',
          )}
        >
          {row.original.opcoNom ?? 'Non résolu'}
        </span>
      ),
    },
    {
      accessorKey: 'facturableHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableHt} tone="facturable" />
      ),
    },
    {
      accessorKey: 'facturableTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableTtc} tone="facturable" />
      ),
    },
    {
      accessorKey: 'emisNonPayeHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeHt} tone="attente" />
      ),
    },
    {
      accessorKey: 'emisNonPayeTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeTtc} tone="attente" />
      ),
    },
    {
      accessorKey: 'bloqueHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => {
        const r = row.original;
        if (r.bloqueHt <= 0) return <MoneyCell value={0} />;
        return (
          <div className="flex flex-col items-end gap-1">
            <MoneyCell value={r.bloqueHt} tone="bloque" />
            <div className="flex flex-wrap justify-end gap-1">
              {r.lockReasons.map((lr) => (
                <span
                  key={lr}
                  className="rounded bg-[var(--warning)]/10 px-1 py-0.5 text-[10px] text-[var(--warning)]"
                >
                  {LOCK_LABELS[lr]}
                </span>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'bloqueTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.bloqueTtc} tone="bloque" />
      ),
    },
    {
      accessorKey: 'previsionnelHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelHt} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'previsionnelTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelTtc} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'contractState',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="État" />
      ),
      cell: ({ row }) => <StateBadge state={row.original.contractState} />,
      filterFn: textFilterFn,
    },
  ];
}

export function createProjetColumns(): ColumnDef<RafProjetRow>[] {
  return [
    {
      accessorKey: 'projetRef',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Projet"
          filterVariant="text"
        />
      ),
      enableColumnFilter: true,
      filterFn: textFilterFn,
      cell: ({ row }) => <ProjectRef ref_={row.original.projetRef} />,
    },
    {
      accessorKey: 'client',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client" />
      ),
      cell: ({ row }) => <span className="text-sm">{row.original.client}</span>,
    },
    {
      accessorKey: 'facturableHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableHt} tone="facturable" />
      ),
    },
    {
      accessorKey: 'facturableTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableTtc} tone="facturable" />
      ),
    },
    {
      accessorKey: 'emisNonPayeHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeHt} tone="attente" />
      ),
    },
    {
      accessorKey: 'emisNonPayeTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeTtc} tone="attente" />
      ),
    },
    {
      accessorKey: 'bloqueHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.bloqueHt} tone="bloque" />
      ),
    },
    {
      accessorKey: 'bloqueTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.bloqueTtc} tone="bloque" />
      ),
    },
    {
      accessorKey: 'previsionnelHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelHt} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'previsionnelTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelTtc} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'nbContratsFacturable',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Contrats prêts"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right text-sm tabular-nums">
          {row.original.nbContratsFacturable} / {row.original.nbContrats}
        </div>
      ),
    },
  ];
}

export function createOpcoColumns(): ColumnDef<RafOpcoRow>[] {
  return [
    {
      accessorKey: 'opcoNom',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="OPCO" />
      ),
      cell: ({ row }) => (
        <span
          className={cn(
            'text-sm font-medium',
            !row.original.opcoCode && 'text-muted-foreground italic',
          )}
        >
          {row.original.opcoNom}
        </span>
      ),
    },
    {
      accessorKey: 'facturableHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableHt} tone="facturable" />
      ),
    },
    {
      accessorKey: 'facturableTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Facturable TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.facturableTtc} tone="facturable" />
      ),
    },
    {
      accessorKey: 'emisNonPayeHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeHt} tone="attente" />
      ),
    },
    {
      accessorKey: 'emisNonPayeTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="En attente TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.emisNonPayeTtc} tone="attente" />
      ),
    },
    {
      accessorKey: 'bloqueHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.bloqueHt} tone="bloque" />
      ),
    },
    {
      accessorKey: 'bloqueTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Bloqué TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.bloqueTtc} tone="bloque" />
      ),
    },
    {
      accessorKey: 'previsionnelHt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel HT"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelHt} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'previsionnelTtc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Prévisionnel TTC"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <MoneyCell value={row.original.previsionnelTtc} tone="previsionnel" />
      ),
    },
    {
      accessorKey: 'nbContratsFacturable',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Contrats prêts"
          className="justify-end"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right text-sm tabular-nums">
          {row.original.nbContratsFacturable}
        </div>
      ),
    },
  ];
}
