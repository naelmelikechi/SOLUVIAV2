'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Clock,
  FileCheck,
  Info,
  TrendingUp,
} from 'lucide-react';

import {
  type ResteAFacturer,
  type RafContratRow,
  type RafProjetRow,
  type RafOpcoRow,
  type RafLockReason,
} from '@/lib/utils/reste-a-facturer';
import {
  DataTable,
  DataTableColumnHeader,
  type FilterOption,
} from '@/components/shared/data-table';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils/formatters';
import { textFilterFn } from '@/lib/utils/table-filters';
import { cn } from '@/lib/utils';

type RafView = 'contrat' | 'projet' | 'opco';
type RafFocus = 'tous' | 'facturable' | 'attente' | 'bloque' | 'previsionnel';

const VIEW_LABELS: Record<RafView, string> = {
  contrat: 'Par contrat',
  projet: 'Par projet',
  opco: 'Par OPCO',
};

const FOCUS_LABELS: Record<RafFocus, string> = {
  tous: 'Tous',
  facturable: 'Facturable',
  attente: 'En attente',
  bloque: 'Bloqué',
  previsionnel: 'Prévisionnel',
};

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

function createContratColumns(): ColumnDef<RafContratRow>[] {
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
      accessorKey: 'contractState',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="État" />
      ),
      cell: ({ row }) => <StateBadge state={row.original.contractState} />,
      filterFn: textFilterFn,
    },
  ];
}

function createProjetColumns(): ColumnDef<RafProjetRow>[] {
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

function createOpcoColumns(): ColumnDef<RafOpcoRow>[] {
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

function RafSummaryCard({
  icon: Icon,
  label,
  amount,
  hint,
  tone,
  tooltip,
}: {
  icon: typeof FileCheck;
  label: string;
  amount: number;
  hint: string;
  tone: 'facturable' | 'attente' | 'bloque' | 'previsionnel';
  tooltip?: string;
}) {
  return (
    <Card
      className={cn(
        'p-4',
        tone === 'facturable' && 'border-[var(--success)]/40',
        tone === 'attente' && 'border-[var(--info)]/40',
        tone === 'bloque' && 'border-[var(--warning)]/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {label}
        </span>
        <Icon
          className={cn(
            'size-4',
            tone === 'facturable' && 'text-[var(--success)]',
            tone === 'attente' && 'text-[var(--info)]',
            tone === 'bloque' && 'text-[var(--warning)]',
            tone === 'previsionnel' && 'text-muted-foreground',
          )}
        />
      </div>
      <div
        className={cn(
          'mt-2 font-mono text-2xl font-bold tabular-nums',
          tone === 'facturable' && 'text-[var(--success)]',
          tone === 'attente' && 'text-[var(--info)]',
          tone === 'bloque' && 'text-[var(--warning)]',
          tone === 'previsionnel' && 'text-foreground',
        )}
      >
        {formatCurrency(amount)}
      </div>
      <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
        <span>{hint}</span>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger className="cursor-default">
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs px-3 py-2">
              <span className="text-xs">{tooltip}</span>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </Card>
  );
}

export function ResteAFacturerTab({ raf }: { raf: ResteAFacturer }) {
  const [view, setView] = useState<RafView>('contrat');
  const [focus, setFocus] = useState<RafFocus>('tous');

  const contratColumns = useMemo(() => createContratColumns(), []);
  const projetColumns = useMemo(() => createProjetColumns(), []);
  const opcoColumns = useMemo(() => createOpcoColumns(), []);

  const contratFilters = useMemo<FilterOption[]>(() => {
    const projets = Array.from(
      new Set(raf.parContrat.map((r) => r.projetRef)),
    ).sort();
    const opcos = Array.from(
      new Set(raf.parContrat.map((r) => r.opcoNom ?? 'Non résolu')),
    ).sort();
    return [
      {
        column: 'projet',
        label: 'Projet',
        options: projets.map((v) => ({ label: v, value: v })),
      },
      {
        column: 'opco',
        label: 'OPCO',
        options: opcos.map((v) => ({ label: v, value: v })),
      },
    ];
  }, [raf.parContrat]);

  const focusedContrats = useMemo(
    () =>
      raf.parContrat.filter((r) => {
        if (focus === 'facturable') return r.facturableHt > 0;
        if (focus === 'attente') return r.emisNonPayeHt > 0;
        if (focus === 'bloque') return r.bloqueHt > 0;
        if (focus === 'previsionnel') return r.previsionnelHt > 0;
        return (
          r.facturableHt > 0 ||
          r.emisNonPayeHt > 0 ||
          r.bloqueHt > 0 ||
          r.previsionnelHt > 0
        );
      }),
    [raf.parContrat, focus],
  );

  const { totals } = raf;
  const isEmpty =
    totals.facturableHt === 0 &&
    totals.emisNonPayeHt === 0 &&
    totals.bloqueHt === 0 &&
    totals.previsionnelHt === 0;

  if (isEmpty) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={FileCheck}
          title="Rien à facturer pour le moment"
          description="Aucun événement facturable, bloqué ou prévisionnel sur les contrats actifs. Les nouveaux bordereaux OPCO apparaîtront ici après la prochaine synchronisation Eduvia."
        />
      </Card>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RafSummaryCard
            icon={FileCheck}
            label="Facturable maintenant"
            amount={totals.facturableHt}
            tone="facturable"
            hint={`${totals.nbContratsFacturable} contrat${totals.nbContratsFacturable > 1 ? 's' : ''} prêt${totals.nbContratsFacturable > 1 ? 's' : ''} · ${formatCurrency(totals.facturableTtc)} TTC`}
          />
          <RafSummaryCard
            icon={Clock}
            label="En attente de paiement"
            amount={totals.emisNonPayeHt}
            tone="attente"
            hint={`${totals.nbContratsEnAttente} contrat${totals.nbContratsEnAttente > 1 ? 's' : ''} - émis, à encaisser`}
            tooltip="Commission sur des bordereaux PEDAGOGIE émis à l'OPCO (TRANSMIS) mais pas encore encaissés. Deviendra facturable au paiement. Exclu de Facturable : on ne facture que l'argent réellement reçu."
          />
          <RafSummaryCard
            icon={AlertTriangle}
            label="Bloqué"
            amount={totals.bloqueHt}
            tone="bloque"
            hint={`${totals.nbContratsBloque} contrat${totals.nbContratsBloque > 1 ? 's' : ''} - donnée à corriger`}
          />
          <RafSummaryCard
            icon={TrendingUp}
            label="Prévisionnel contractuel"
            amount={totals.previsionnelHt}
            tone="previsionnel"
            hint="estimation, base NPEC"
            tooltip="Estimation : potentiel de commission sur le NPEC contractuel des contrats actifs, moins tout ce qui est déjà émis (facturable + en attente + déjà facturé). Ce sont les steps OPCO pas encore émis. Borne haute (le NPEC inclut le matériel non commissionné)."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="bg-muted inline-flex items-center rounded-lg p-0.5">
            {(['contrat', 'projet', 'opco'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  view === v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === 'contrat' ? (
            <div className="bg-muted inline-flex items-center rounded-lg p-0.5">
              {(
                [
                  'tous',
                  'facturable',
                  'attente',
                  'bloque',
                  'previsionnel',
                ] as const
              ).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFocus(f)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    focus === f
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {FOCUS_LABELS[f]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {view === 'contrat' ? (
          <DataTable
            columns={contratColumns}
            data={focusedContrats}
            searchKey="contrat"
            searchPlaceholder="Rechercher un contrat, apprenant..."
            defaultSort={{ id: 'facturableHt', desc: true }}
            filters={contratFilters}
          />
        ) : view === 'projet' ? (
          <DataTable
            columns={projetColumns}
            data={raf.parProjet}
            searchKey="projetRef"
            searchPlaceholder="Rechercher un projet, client..."
            defaultSort={{ id: 'facturableHt', desc: true }}
          />
        ) : (
          <DataTable
            columns={opcoColumns}
            data={raf.parOpco}
            searchKey="opcoNom"
            searchPlaceholder="Rechercher un OPCO..."
            defaultSort={{ id: 'facturableHt', desc: true }}
          />
        )}

        <p className="text-muted-foreground text-xs">
          Montants HT. Facturable = commission sur les règlements OPCO encaissés
          (REGLE) non encore facturés. En attente = émis (TRANSMIS) pas encore
          payé. Bloqué = payé mais donnée à corriger. Prévisionnel = estimation
          base NPEC des steps non encore émis (contrats actifs).
        </p>
      </div>
    </TooltipProvider>
  );
}
