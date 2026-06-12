'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContratRow } from '@/lib/queries/projets';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { isContratActif } from '@/lib/utils/contrat-states';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { ContratDetailSheet } from '@/components/projets/contrat-detail-sheet';

const CONTRACT_STATE_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
  termine: 'Terminé',
  NOTSENT: 'Pas envoyé',
  TRANSMIS: 'Transmis',
  EN_COURS_INSTRUCTION: "En cours d'instruction",
  ENGAGE: 'Engagé',
  ANNULE: 'Annulé',
};

const CONTRACT_STATE_COLORS: Record<string, BadgeColor> = {
  actif: 'green',
  suspendu: 'orange',
  resilie: 'red',
  termine: 'gray',
  NOTSENT: 'gray',
  TRANSMIS: 'blue',
  EN_COURS_INSTRUCTION: 'orange',
  ENGAGE: 'green',
  ANNULE: 'red',
};

function computeProgressionTheorique(
  dateDebut: string | null,
  dateFin: string | null,
): number {
  if (!dateDebut || !dateFin) return 0;
  const start = new Date(dateDebut).getTime();
  const end = new Date(dateFin).getTime();
  const now = Date.now();
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return 100;
  const elapsedDays = (now - start) / (1000 * 60 * 60 * 24);
  return Math.min(
    100,
    Math.max(0, Math.round((elapsedDays / totalDays) * 100)),
  );
}

// Eduvia API quirk: paid_amount toujours = 0 sur
// /contracts/{id}/invoice_steps. Le payé OPCO est porte par
// invoice_state='REGLE' (+ paid_at). On derive donc le montant
// paye = total_amount quand l'etape est REGLE.
function isStepPaid(s: {
  invoice_state: string | null;
  paid_at: string | null;
}): boolean {
  return s.invoice_state === 'REGLE' || s.paid_at !== null;
}

function computePaidTotal(c: ContratRow): number {
  return (c.invoice_steps ?? []).reduce(
    (sum, step) =>
      sum + (isStepPaid(step) ? Number(step.total_amount ?? 0) : 0),
    0,
  );
}

function progressionReelle(c: ContratRow): number | null {
  return c.progression?.progression_percentage !== null &&
    c.progression?.progression_percentage !== undefined
    ? Math.round(Number(c.progression.progression_percentage))
    : null;
}

function ProgressBar({
  value,
  comparison,
  color,
}: {
  value: number;
  comparison?: number;
  color: string;
}) {
  const isBelow = comparison !== undefined && value < comparison;
  const barColor = isBelow ? 'bg-[var(--warning)]' : color;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--border-light)]">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {value}%
      </span>
    </div>
  );
}

const columns: ColumnDef<ContratRow>[] = [
  {
    id: 'ref',
    // Concatene les 3 identifiants pour que la recherche globale matche
    // DECA, numero Eduvia et ref Soluvia (comportement historique).
    accessorFn: (c) =>
      [c.contract_number, c.internal_number, c.ref].filter(Boolean).join(' '),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Réf" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      return (
        <Tooltip>
          <TooltipTrigger className="block cursor-default text-left">
            <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
              {c.contract_number ?? c.ref}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="space-y-0.5 px-3 py-2">
            <div className="text-xs">
              <span className="text-muted-foreground">DECA : </span>
              <span className="font-mono">{c.contract_number ?? '-'}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Eduvia : </span>
              <span className="font-mono">{c.internal_number ?? '-'}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Soluvia : </span>
              <span className="font-mono">{c.ref}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    id: 'apprenant',
    accessorFn: (c) => `${c.apprenant_prenom ?? ''} ${c.apprenant_nom ?? ''}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Apprenant" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.apprenant_prenom} {row.original.apprenant_nom}
      </span>
    ),
  },
  {
    accessorKey: 'formation_titre',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Formation" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="max-w-[200px] text-sm">
          {c.formation_titre ? (
            <Tooltip>
              <TooltipTrigger className="block max-w-full cursor-default truncate text-left">
                {c.formation_titre}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-sm space-y-1 px-3 py-2"
              >
                <div className="text-sm font-semibold">{c.formation_titre}</div>
                <div className="text-muted-foreground space-y-0.5 text-xs tabular-nums">
                  <div>
                    Apprenant : {c.apprenant_prenom} {c.apprenant_nom}
                  </div>
                  {c.duree_mois ? <div>Durée : {c.duree_mois} mois</div> : null}
                  {c.date_debut && c.date_fin ? (
                    <div>
                      {formatDate(c.date_debut)} - {formatDate(c.date_fin)}
                    </div>
                  ) : null}
                  {c.npec_amount ? (
                    <div>NPEC : {formatCurrency(c.npec_amount)}</div>
                  ) : null}
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'date_debut',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Début" />
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {row.original.date_debut ? formatDate(row.original.date_debut) : '-'}
      </span>
    ),
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
    accessorFn: (c) =>
      CONTRACT_STATE_LABELS[c.contract_state] ?? c.contract_state,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Statut" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        label={
          CONTRACT_STATE_LABELS[row.original.contract_state] ??
          row.original.contract_state
        }
        color={CONTRACT_STATE_COLORS[row.original.contract_state] ?? 'gray'}
      />
    ),
  },
  {
    accessorKey: 'npec_amount',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Prise en charge"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {row.original.npec_amount
          ? formatCurrency(row.original.npec_amount)
          : '-'}
      </div>
    ),
  },
  {
    id: 'encaisse',
    accessorFn: (c) => computePaidTotal(c),
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Encaissé"
        className="justify-end"
      />
    ),
    cell: ({ row }) => {
      const c = row.original;
      const steps = c.invoice_steps ?? [];
      if (steps.length === 0) {
        return (
          <div className="text-muted-foreground text-right text-xs">-</div>
        );
      }
      const paidTotal = computePaidTotal(c);
      const invoicedTotal = steps.reduce(
        (s, step) => s + Number(step.total_amount ?? 0),
        0,
      );
      const paidStepsCount = steps.filter(isStepPaid).length;
      return (
        <Tooltip>
          <TooltipTrigger className="block w-full cursor-default text-right">
            <div className="font-mono text-sm tabular-nums">
              {paidTotal > 0 ? (
                <span className="text-[var(--success)]">
                  {formatCurrency(paidTotal)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {formatCurrency(0)}
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-[10px] tabular-nums">
              {paidStepsCount}/{steps.length}
              {steps.length > 1 ? ' échéances' : ' échéance'}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="space-y-0.5 px-3 py-2">
            <div className="text-xs">
              <span className="text-muted-foreground">{'Encaissé : '}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(paidTotal)}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{'Facturé : '}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(invoicedTotal)}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">{'Reste : '}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(invoicedTotal - paidTotal)}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    id: 'progression',
    accessorFn: (c) =>
      progressionReelle(c) ??
      computeProgressionTheorique(c.date_debut, c.date_fin),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Progression" />
    ),
    cell: ({ row }) => {
      const c = row.original;
      const theorique = computeProgressionTheorique(c.date_debut, c.date_fin);
      const reelle = progressionReelle(c);
      return (
        <Tooltip>
          <TooltipTrigger className="block cursor-default">
            <ProgressBar
              value={reelle ?? theorique}
              comparison={reelle !== null ? theorique : undefined}
              color="bg-[var(--primary)]"
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="space-y-1 px-3 py-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Eduvia : </span>
              <span className="font-mono tabular-nums">
                {reelle !== null ? `${reelle}%` : 'non synchronisé'}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Théorique : </span>
              <span className="font-mono tabular-nums">{theorique}%</span>
            </div>
            {c.progression?.total_spent_time_hours ? (
              <div className="text-muted-foreground text-xs">
                Temps passé :{' '}
                {Number(c.progression.total_spent_time_hours).toFixed(1)} h
              </div>
            ) : null}
          </TooltipContent>
        </Tooltip>
      );
    },
  },
];

export function ProjetContratsTable({ contrats }: { contrats: ContratRow[] }) {
  const [selectedContratId, setSelectedContratId] = useState<string | null>(
    null,
  );
  const actifs = contrats.filter((c) =>
    isContratActif(c.contract_state),
  ).length;

  const realProgressions = contrats
    .map((c) => c.progression?.progression_percentage)
    .filter((p): p is number => p !== null && p !== undefined)
    .map(Number);
  const moyenneProgression =
    realProgressions.length > 0
      ? Math.round(
          realProgressions.reduce((sum, p) => sum + p, 0) /
            realProgressions.length,
        )
      : 0;

  return (
    <TooltipProvider delay={200}>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Contrats</h3>
            <StatusBadge label="Eduvia" color="orange" />
          </div>
          <div className="flex items-center gap-4">
            {contrats.length > 0 && realProgressions.length > 0 && (
              <span className="text-muted-foreground text-sm">
                Progression moyenne :{' '}
                <span className="font-semibold tabular-nums">
                  {moyenneProgression}%
                </span>{' '}
                Eduvia ({realProgressions.length}/{contrats.length} synchros)
              </span>
            )}
            <span className="text-muted-foreground text-sm">
              {actifs} contrat{actifs > 1 ? 's' : ''} actif
              {actifs > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {contrats.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun contrat synchronisé
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={contrats}
            searchPlaceholder="Rechercher un contrat..."
            paginationMode="auto"
            onRowClick={(c) => setSelectedContratId(c.id)}
            emptyMessage="Aucun résultat."
          />
        )}
      </Card>
      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
