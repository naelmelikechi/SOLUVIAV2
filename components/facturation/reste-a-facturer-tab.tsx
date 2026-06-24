'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FileCheck,
  Info,
  TrendingUp,
} from 'lucide-react';

import { type ResteAFacturer } from '@/lib/utils/reste-a-facturer';
import { DataTable, type FilterOption } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import {
  createContratColumns,
  createProjetColumns,
  createOpcoColumns,
} from './reste-a-facturer-columns';

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
