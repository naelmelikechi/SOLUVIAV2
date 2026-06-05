'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';

import {
  createFactureFromEvents,
  type SelectedEvent,
} from '@/lib/actions/factures';
import type {
  ProjetBillableEvents,
  BillableEvent,
} from '@/lib/queries/billable-events';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { OpcoFilter } from './opco-filter';

interface ManuelTabProps {
  projets: ProjetBillableEvents[];
}

type EventKey = string;

function eventKey(e: Pick<BillableEvent, 'type' | 'source_id'>): EventKey {
  return `${e.type}::${e.source_id}`;
}

const NDASH = '-';

// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer
export function ManuelTab({ projets }: ManuelTabProps) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedProjetId, setSelectedProjetId] = useState<string>(
    projets[0]?.projetId ?? '',
  );
  const [showEngagements, setShowEngagements] = useState(true);
  const [showOpcoSteps, setShowOpcoSteps] = useState(true);
  const [includeBilled, setIncludeBilled] = useState(false);
  const [selected, setSelected] = useState<Set<EventKey>>(new Set());
  // Filtre OPCO : [projetId, codes[]] — le projetId permet de detecter un changement
  // de projet et de reinitialiser le filtre sans useEffect.
  const [opcoFilterState, setOpcoFilterState] = useState<{
    projetId: string;
    codes: string[];
  }>({ projetId: '', codes: [] });

  const projet = useMemo(
    () => projets.find((p) => p.projetId === selectedProjetId) ?? null,
    [projets, selectedProjetId],
  );

  const events = useMemo(() => projet?.events ?? [], [projet]);

  // Calcul des codes OPCO disponibles pour le projet courant
  const allAvailableOpcoCodes = useMemo(
    () =>
      Array.from(
        new Set(
          events.flatMap((e) =>
            e.status === 'available' && e.opco_code
              ? [e.opco_code as string]
              : [],
          ),
        ),
      ),
    [events],
  );

  // Derive le filtre courant : si le projet a change, reinitialise sur tous les codes
  const opcoCodesFilter =
    opcoFilterState.projetId === selectedProjetId
      ? opcoFilterState.codes
      : allAvailableOpcoCodes;

  function setOpcoCodesFilter(codes: string[]) {
    setOpcoFilterState({ projetId: selectedProjetId, codes });
  }

  // Compteurs (uniquement events 'available')
  const availableEngagements = useMemo(
    () =>
      (projet?.events ?? []).filter(
        (e) => e.type === 'engagement' && e.status === 'available',
      ).length,
    [projet],
  );
  const availableOpcoSteps = useMemo(
    () =>
      (projet?.events ?? []).filter(
        (e) => e.type === 'opco_step' && e.status === 'available',
      ).length,
    [projet],
  );

  // Lignes affichees (apres filtres)
  const displayedEvents = useMemo<BillableEvent[]>(() => {
    if (!projet) return [];
    return projet.events.filter((e) => {
      if (e.type === 'engagement' && !showEngagements) return false;
      if (e.type === 'opco_step' && !showOpcoSteps) return false;
      if (e.status === 'billed' && !includeBilled) return false;
      if (
        opcoCodesFilter.length > 0 &&
        e.opco_code &&
        !opcoCodesFilter.includes(e.opco_code)
      )
        return false;
      return true;
    });
  }, [projet, showEngagements, showOpcoSteps, includeBilled, opcoCodesFilter]);

  // Selection helpers
  const isSelected = (e: BillableEvent) => selected.has(eventKey(e));

  const toggleOne = (e: BillableEvent) => {
    if (e.status !== 'available') return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = eventKey(e);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      // Anti-double-cliquer : si on coche un engagement, decocher les
      // opco_step du meme contrat (et inverse).
      const opposite: BillableEvent['type'] =
        e.type === 'engagement' ? 'opco_step' : 'engagement';
      let removed = 0;
      if (projet) {
        for (const other of projet.events) {
          if (
            other.contrat_id === e.contrat_id &&
            other.type === opposite &&
            next.has(eventKey(other))
          ) {
            next.delete(eventKey(other));
            removed += 1;
          }
        }
      }
      next.add(key);
      if (removed > 0) {
        const label =
          opposite === 'engagement'
            ? removed > 1
              ? 'engagements décochés'
              : 'engagement décoché'
            : removed > 1
              ? 'règlements OPCO décochés'
              : 'règlement OPCO décoché';
        toast.info(
          `${removed} ${label} sur ce contrat (exclusif avec ${e.type === 'engagement' ? "l'engagement" : 'les règlements OPCO'}).`,
        );
      }
      return next;
    });
  };

  const availableInDisplay = useMemo(
    () => displayedEvents.filter((e) => e.status === 'available'),
    [displayedEvents],
  );

  const allDisplayedSelected =
    availableInDisplay.length > 0 &&
    availableInDisplay.every((e) => selected.has(eventKey(e)));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDisplayedSelected) {
        for (const e of availableInDisplay) next.delete(eventKey(e));
        return next;
      }
      // Selectionne tout, en respectant la regle d'exclusion par contrat :
      // priorite a engagement (deja trie en premier).
      const seenContrat = new Map<string, BillableEvent['type']>();
      // pre-scan de la selection courante pour respecter ce qui est deja la
      for (const e of availableInDisplay) {
        const k = eventKey(e);
        if (next.has(k)) seenContrat.set(e.contrat_id, e.type);
      }
      for (const e of availableInDisplay) {
        const lockType = seenContrat.get(e.contrat_id);
        if (lockType && lockType !== e.type) continue;
        next.add(eventKey(e));
        seenContrat.set(e.contrat_id, e.type);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    if (!projet) return { count: 0, ht: 0 };
    let count = 0;
    let ht = 0;
    for (const e of projet.events) {
      if (selected.has(eventKey(e))) {
        count += 1;
        ht += e.montant_commissionne;
      }
    }
    return { count, ht };
  }, [projet, selected]);

  const onCancel = () => {
    setSelected(new Set());
  };

  const onPrepare = () => {
    if (!projet) return;
    if (totals.count === 0) {
      toast.error('Sélectionnez au moins un événement');
      return;
    }
    const payload: SelectedEvent[] = [];
    for (const e of projet.events) {
      if (selected.has(eventKey(e))) {
        payload.push({ type: e.type, source_id: e.source_id });
      }
    }
    startTransition(async () => {
      const filterToPass =
        opcoCodesFilter.length > 0 &&
        opcoCodesFilter.length < allAvailableOpcoCodes.length
          ? opcoCodesFilter
          : undefined;

      const res = await createFactureFromEvents({
        projetId: projet.projetId,
        events: payload,
        opcoCodesFilter: filterToPass,
      });
      if (res.success) {
        toast.success(
          'Brouillon de facture préparé. À vérifier puis envoyer dans l’onglet Brouillons.',
        );
        setSelected(new Set());
        refresh();
      } else {
        toast.error(res.error ?? 'Erreur lors de la préparation du brouillon');
      }
    });
  };

  if (projets.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={FileText}
          title="Aucun projet en mode facturation manuelle"
          description={
            'Configure un projet en mode "manuel" depuis sa fiche pour pouvoir facturer manuellement.'
          }
        />
      </Card>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <Card className="p-6">
        {/* Selecteur projet */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Projet :</span>
            <Select
              value={selectedProjetId}
              onValueChange={(v) => {
                setSelectedProjetId(v ?? '');
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="min-w-[280px]">
                <SelectValue placeholder="Sélectionner un projet">
                  {(value) => {
                    const p = projets.find((x) => x.projetId === value);
                    if (!p) return 'Sélectionner un projet';
                    return (
                      <>
                        <span className="font-mono text-xs">{p.projetRef}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          {NDASH} {p.clientRaisonSociale}
                        </span>
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projets.map((p) => (
                  <SelectItem key={p.projetId} value={p.projetId}>
                    <span className="font-mono text-xs">{p.projetRef}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      {NDASH} {p.clientRaisonSociale}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projet ? (
            <div className="text-muted-foreground text-sm">
              Commission :{' '}
              <span className="text-foreground font-semibold tabular-nums">
                {projet.tauxCommission}%
              </span>
            </div>
          ) : null}
        </div>

        {projet ? (
          <>
            {/* Filtres */}
            <div className="border-border bg-muted/30 mb-4 flex flex-wrap items-center gap-5 rounded-lg border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showEngagements}
                  onChange={(e) => setShowEngagements(e.target.checked)}
                  className="border-input size-4 rounded"
                  aria-label="Afficher les engagements"
                />
                <span>
                  Engagements{' '}
                  <span className="text-muted-foreground">
                    ({availableEngagements} disponible
                    {availableEngagements > 1 ? 's' : ''})
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showOpcoSteps}
                  onChange={(e) => setShowOpcoSteps(e.target.checked)}
                  className="border-input size-4 rounded"
                  aria-label="Afficher les règlements OPCO"
                />
                <span>
                  Règlements OPCO{' '}
                  <span className="text-muted-foreground">
                    ({availableOpcoSteps} disponible
                    {availableOpcoSteps > 1 ? 's' : ''})
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeBilled}
                  onChange={(e) => setIncludeBilled(e.target.checked)}
                  className="border-input size-4 rounded"
                  aria-label="Inclure les événements déjà facturés"
                />
                <span className="text-muted-foreground">
                  Inclure facturés (mode revue)
                </span>
              </label>
            </div>

            {/* Filtre OPCO */}
            <div className="mb-4">
              <OpcoFilter
                events={events}
                selected={opcoCodesFilter}
                onChange={setOpcoCodesFilter}
              />
            </div>

            {/* Table */}
            <div className="border-border overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allDisplayedSelected}
                        onChange={toggleAll}
                        disabled={availableInDisplay.length === 0}
                        className="border-input size-4 rounded"
                        aria-label="Tout sélectionner"
                      />
                    </TableHead>
                    <TableHead>DECA</TableHead>
                    <TableHead>Apprenant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead className="text-right">HT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedEvents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-muted-foreground h-16 text-center text-sm"
                      >
                        Aucun événement à afficher.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedEvents.map((e) => {
                      const key = eventKey(e);
                      const apprenant =
                        `${e.apprenant_prenom} ${e.apprenant_nom}`.trim();
                      const isLocked = e.status === 'locked';
                      const isBilled = e.status === 'billed';
                      const disabled = isLocked || isBilled;
                      const checked = isSelected(e);

                      const deca = e.contract_number ?? e.contrat_ref ?? '';
                      const stepSuffix =
                        e.type === 'opco_step' && e.step_number !== null
                          ? ` #${e.step_number}`
                          : '';

                      return (
                        <TableRow
                          key={key}
                          aria-disabled={disabled || undefined}
                          className={cn(
                            disabled && 'opacity-60',
                            isBilled && 'bg-muted/40',
                            !disabled && 'hover:bg-muted/40',
                          )}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleOne(e)}
                              className="border-input size-4 rounded disabled:cursor-not-allowed"
                              aria-label={`Sélectionner ${e.type === 'engagement' ? 'engagement' : 'réglement OPCO'} ${deca}${stepSuffix}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground font-mono text-[11px]">
                                {deca}
                                {stepSuffix}
                              </span>
                              {isLocked ? (
                                e.lock_reason === 'missing_idcc' ? (
                                  <Tooltip>
                                    <TooltipTrigger className="flex cursor-default items-center gap-1 text-left text-[10px] text-[var(--warning)]">
                                      <AlertTriangle className="size-3" />
                                      <span>
                                        {'Verrouillé'} : IDCC manquant
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="max-w-xs px-3 py-2"
                                    >
                                      <div className="text-xs">
                                        {
                                          "La convention collective (IDCC) de l'employeur est absente côté Eduvia : impossible de déterminer l'OPCO. Renseignez-la avant de facturer."
                                        }
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : e.lock_reason === 'unknown_opco' ? (
                                  <Tooltip>
                                    <TooltipTrigger className="flex cursor-default items-center gap-1 text-left text-[10px] text-[var(--warning)]">
                                      <AlertTriangle className="size-3" />
                                      <span>
                                        {'Verrouillé'} : OPCO non identifié
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="max-w-xs px-3 py-2"
                                    >
                                      <div className="text-xs">
                                        {
                                          "L'IDCC de l'employeur n'est rattaché à aucun OPCO du référentiel. Mappez-le dans /admin/parametres/opcos."
                                        }
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : e.lock_reason === 'unknown_line_type' ? (
                                  <Tooltip>
                                    <TooltipTrigger className="flex cursor-default items-center gap-1 text-left text-[10px] text-[var(--warning)]">
                                      <AlertTriangle className="size-3" />
                                      <span>
                                        {'Verrouillé'} : type(s) OPCO inconnu(s)
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="max-w-xs px-3 py-2"
                                    >
                                      <div className="text-xs">
                                        {'Type(s) de ligne OPCO inconnu(s) : '}
                                        <span className="font-mono">
                                          {(e.unknown_line_types ?? []).join(
                                            ', ',
                                          )}
                                        </span>
                                        {
                                          '. Décision admin requise dans lib/eduvia/line-types.ts.'
                                        }
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : e.locked_by ? (
                                  <Tooltip>
                                    <TooltipTrigger className="flex cursor-default items-center gap-1 text-left text-[10px] text-[var(--warning)]">
                                      <Lock className="size-3" />
                                      <span>
                                        {'Verrouillé'} :{' '}
                                        {e.type === 'opco_step'
                                          ? "engagement à facturer d'abord"
                                          : 'réglements OPCO déjà facturés'}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="max-w-xs px-3 py-2"
                                    >
                                      <div className="text-xs">
                                        {e.type === 'opco_step'
                                          ? "Verrouillé car l'engagement de ce contrat a déjà été facturé sur "
                                          : 'Verrouillé car un réglement OPCO de ce contrat a déjà été facturé sur '}
                                        <span className="font-mono">
                                          {e.locked_by.facture_ref ??
                                            'brouillon'}
                                        </span>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null
                              ) : null}
                              {isBilled && e.billed_on ? (
                                <Tooltip>
                                  <TooltipTrigger className="flex cursor-default items-center gap-1 text-left text-[10px] text-[var(--success)]">
                                    <CheckCircle2 className="size-3" />
                                    <span>
                                      {'Déjà facturé sur '}
                                      <span className="font-mono">
                                        {e.billed_on.facture_ref ?? 'brouillon'}
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-xs px-3 py-2"
                                  >
                                    <div className="text-xs">
                                      {'Déjà facturé sur '}
                                      <span className="font-mono">
                                        {e.billed_on.facture_ref ?? 'brouillon'}
                                      </span>
                                      {' ('}
                                      {e.billed_on.facture_statut}
                                      {')'}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {apprenant || (
                              <span className="text-muted-foreground">
                                {NDASH}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {e.type === 'engagement' ? (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge label="Engagement" color="green" />
                                <span className="text-muted-foreground text-[10px]">
                                  ENGAGE
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge
                                  label={`OPCO REGLE${stepSuffix}`}
                                  color="blue"
                                />
                                <span className="text-muted-foreground text-[10px]">
                                  {e.step_paid_at
                                    ? formatDate(e.step_paid_at)
                                    : 'REGLE'}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {e.invoice_state ? (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge
                                  label={
                                    e.invoice_state === 'REGLE'
                                      ? 'Payé'
                                      : e.invoice_state === 'TRANSMIS'
                                        ? 'Transmis'
                                        : e.invoice_state
                                  }
                                  color={
                                    e.invoice_state === 'REGLE'
                                      ? 'green'
                                      : e.invoice_state === 'TRANSMIS'
                                        ? 'orange'
                                        : 'gray'
                                  }
                                />
                                {e.step_paid_at ? (
                                  <span className="text-muted-foreground text-[10px]">
                                    {formatDate(e.step_paid_at)}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                {NDASH}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isLocked ? (
                              <span className="text-muted-foreground font-mono text-sm">
                                {NDASH} {NDASH} {NDASH}
                              </span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span
                                  className={cn(
                                    'font-mono text-sm tabular-nums',
                                    isBilled && 'text-muted-foreground',
                                  )}
                                >
                                  {formatCurrency(e.montant_commissionne)}
                                </span>
                                <span className="text-muted-foreground text-[10px] tabular-nums">
                                  {formatCurrency(e.montant_brut)} {'×'}{' '}
                                  {projet.tauxCommission}%
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer : recap + actions */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground text-sm">
                {'Sélection :'}{' '}
                <span className="text-foreground font-semibold tabular-nums">
                  {totals.count}
                </span>{' '}
                ligne{totals.count > 1 ? 's' : ''}
                {' · '}
                Total HT{' '}
                <span className="text-foreground font-semibold tabular-nums">
                  {formatCurrency(totals.ht)}
                </span>
                {' · '}
                Commission {projet.tauxCommission}%
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={isPending || totals.count === 0}
                >
                  Annuler
                </Button>
                <Button
                  onClick={onPrepare}
                  disabled={
                    isPending ||
                    totals.count === 0 ||
                    (opcoCodesFilter.length === 0 &&
                      allAvailableOpcoCodes.length > 0)
                  }
                >
                  {isPending
                    ? 'Preparation...'
                    : opcoCodesFilter.length === 0 &&
                        allAvailableOpcoCodes.length > 0
                      ? 'Selectionnez au moins un OPCO'
                      : 'Preparer le brouillon'}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </TooltipProvider>
  );
}
