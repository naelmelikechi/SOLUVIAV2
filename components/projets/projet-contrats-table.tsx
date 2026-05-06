'use client';

import { useMemo, useState } from 'react';
import type { ContratRow } from '@/lib/queries/projets';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { isContratActif } from '@/lib/utils/contrat-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export function ProjetContratsTable({ contrats }: { contrats: ContratRow[] }) {
  const [search, setSearch] = useState('');
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

  const filteredContrats = useMemo(
    () =>
      filterBySearch(contrats, search, (c) =>
        [
          c.ref,
          c.contract_number,
          c.internal_number,
          c.apprenant_prenom,
          c.apprenant_nom,
          c.formation_titre,
          CONTRACT_STATE_LABELS[c.contract_state] ?? c.contract_state,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [contrats, search],
  );

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
          <>
            <div className="mb-3">
              <TableSearchInput
                value={search}
                onChange={setSearch}
                placeholder="Rechercher un contrat..."
              />
            </div>
            <div className="border-border overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Réf</TableHead>
                    <TableHead>Apprenant</TableHead>
                    <TableHead>Formation</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">
                      Prise en charge
                    </TableHead>
                    <TableHead className="text-right">Encaissé</TableHead>
                    <TableHead>Progression</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContrats.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-muted-foreground h-16 text-center text-sm"
                      >
                        Aucun résultat.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredContrats.map((c) => {
                    const theorique = computeProgressionTheorique(
                      c.date_debut,
                      c.date_fin,
                    );
                    const reelle =
                      c.progression?.progression_percentage !== null &&
                      c.progression?.progression_percentage !== undefined
                        ? Math.round(
                            Number(c.progression.progression_percentage),
                          )
                        : null;
                    // Eduvia API quirk: paid_amount toujours = 0 sur
                    // /contracts/{id}/invoice_steps. Le payé OPCO est porte
                    // par invoice_state='REGLE' (+ paid_at). On derive donc
                    // le montant paye = total_amount quand l'etape est REGLE.
                    const isStepPaid = (s: {
                      invoice_state: string | null;
                      paid_at: string | null;
                    }) => s.invoice_state === 'REGLE' || s.paid_at !== null;
                    const paidTotal = (c.invoice_steps ?? []).reduce(
                      (sum, step) =>
                        sum +
                        (isStepPaid(step) ? Number(step.total_amount ?? 0) : 0),
                      0,
                    );
                    const invoicedTotal = (c.invoice_steps ?? []).reduce(
                      (s, step) => s + Number(step.total_amount ?? 0),
                      0,
                    );
                    const paidStepsCount = (c.invoice_steps ?? []).filter(
                      isStepPaid,
                    ).length;
                    return (
                      <TableRow
                        key={c.id}
                        onClick={() => setSelectedContratId(c.id)}
                        className="hover:bg-muted/50 cursor-pointer"
                      >
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger className="block cursor-default text-left">
                              <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
                                {c.contract_number ?? c.ref}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="space-y-0.5 px-3 py-2"
                            >
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  DECA :{' '}
                                </span>
                                <span className="font-mono">
                                  {c.contract_number ?? '-'}
                                </span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Eduvia :{' '}
                                </span>
                                <span className="font-mono">
                                  {c.internal_number ?? '-'}
                                </span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Soluvia :{' '}
                                </span>
                                <span className="font-mono">{c.ref}</span>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.apprenant_prenom} {c.apprenant_nom}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm">
                          {c.formation_titre ? (
                            <Tooltip>
                              <TooltipTrigger className="block max-w-full cursor-default truncate text-left">
                                {c.formation_titre}
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-sm space-y-1 px-3 py-2"
                              >
                                <div className="text-sm font-semibold">
                                  {c.formation_titre}
                                </div>
                                <div className="text-muted-foreground space-y-0.5 text-xs tabular-nums">
                                  <div>
                                    Apprenant : {c.apprenant_prenom}{' '}
                                    {c.apprenant_nom}
                                  </div>
                                  {c.duree_mois ? (
                                    <div>Durée : {c.duree_mois} mois</div>
                                  ) : null}
                                  {c.date_debut && c.date_fin ? (
                                    <div>
                                      {formatDate(c.date_debut)} -{' '}
                                      {formatDate(c.date_fin)}
                                    </div>
                                  ) : null}
                                  {c.npec_amount ? (
                                    <div>
                                      NPEC : {formatCurrency(c.npec_amount)}
                                    </div>
                                  ) : null}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {c.date_debut ? formatDate(c.date_debut) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {c.date_fin ? formatDate(c.date_fin) : '\u2014'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={
                              CONTRACT_STATE_LABELS[c.contract_state] ??
                              c.contract_state
                            }
                            color={
                              CONTRACT_STATE_COLORS[c.contract_state] ?? 'gray'
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {c.npec_amount
                            ? formatCurrency(c.npec_amount)
                            : '\u2014'}
                        </TableCell>
                        <TableCell className="text-right">
                          {(c.invoice_steps ?? []).length === 0 ? (
                            <span className="text-muted-foreground text-xs">
                              {'\u2014'}
                            </span>
                          ) : (
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
                                  {paidStepsCount}/
                                  {c.invoice_steps?.length ?? 0}
                                  {(c.invoice_steps?.length ?? 0) > 1
                                    ? ' \u00e9ch\u00e9ances'
                                    : ' \u00e9ch\u00e9ance'}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="space-y-0.5 px-3 py-2"
                              >
                                <div className="text-xs">
                                  <span className="text-muted-foreground">
                                    {'Encaiss\u00e9 : '}
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(paidTotal)}
                                  </span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-muted-foreground">
                                    {'Factur\u00e9 : '}
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(invoicedTotal)}
                                  </span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-muted-foreground">
                                    {'Reste : '}
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(invoicedTotal - paidTotal)}
                                  </span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger className="block cursor-default">
                              <ProgressBar
                                value={reelle ?? theorique}
                                comparison={
                                  reelle !== null ? theorique : undefined
                                }
                                color="bg-[var(--primary)]"
                              />
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="space-y-1 px-3 py-2"
                            >
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Eduvia :{' '}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {reelle !== null
                                    ? `${reelle}%`
                                    : 'non synchronisé'}
                                </span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Théorique :{' '}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {theorique}%
                                </span>
                              </div>
                              {c.progression?.total_spent_time_hours ? (
                                <div className="text-muted-foreground text-xs">
                                  Temps passé :{' '}
                                  {Number(
                                    c.progression.total_spent_time_hours,
                                  ).toFixed(1)}{' '}
                                  h
                                </div>
                              ) : null}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
      <ContratDetailSheet
        contratId={selectedContratId}
        onOpenChange={(open) => !open && setSelectedContratId(null)}
      />
    </TooltipProvider>
  );
}
