'use client';

import { useState, useMemo, useTransition } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionByClientRow,
  ProductionByProjetRow,
} from '@/lib/actions/production';
import {
  fetchProductionByClient,
  fetchProductionByProjet,
} from '@/lib/actions/production';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import type { MonthRow } from './build-display-data';

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface MonthlyViewProps {
  data: MonthRow[];
  perspective: 'opco' | 'soluvia';
  filterProjets?: string[];
  onProjetsDiscovered?: (refs: string[]) => void;
}

const EMPTY_FILTER_PROJETS: string[] = [];

export function MonthlyView({
  data,
  perspective,
  filterProjets = EMPTY_FILTER_PROJETS,
  onProjetsDiscovered,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: MonthlyViewProps) {
  const [, startTransition] = useTransition();

  const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set());
  const [clientDataByMois, setClientDataByMois] = useState<
    Map<string, ProductionByClientRow[]>
  >(new Map());
  const [loadingMois, setLoadingMois] = useState<Set<string>>(new Set());

  // Cle = `${mois}::${clientId}`
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(),
  );
  const [projetDataByClient, setProjetDataByClient] = useState<
    Map<string, ProductionByProjetRow[]>
  >(new Map());
  const [loadingClients, setLoadingClients] = useState<Set<string>>(new Set());

  const [showGroups, setShowGroups] = useState({
    mois: true,
    soldes: true,
    rolling12: false,
    annee: false,
  });

  const isSoluvia = perspective === 'soluvia';

  const totalColumnCount =
    1 +
    (showGroups.mois ? 3 : 0) +
    (showGroups.soldes ? 3 : 0) +
    (showGroups.rolling12 ? 1 : 0) +
    (showGroups.annee ? 1 : 0);

  type YearGroupItem =
    | { kind: 'banner'; year: number }
    | { kind: 'row'; row: MonthRow };

  const rowsWithYearBreaks = useMemo<YearGroupItem[]>(() => {
    const out: YearGroupItem[] = [];
    let currentYear: number | null = null;
    for (const row of data) {
      const year = Number(row.mois.slice(0, 4));
      if (year !== currentYear) {
        out.push({ kind: 'banner', year });
        currentYear = year;
      }
      out.push({ kind: 'row', row });
    }
    return out;
  }, [data]);

  function toggleMois(mois: string) {
    setExpandedMois((prev) => {
      const next = new Set(prev);
      if (next.has(mois)) {
        next.delete(mois);
      } else {
        next.add(mois);
      }
      return next;
    });

    if (clientDataByMois.has(mois) || loadingMois.has(mois)) return;

    setLoadingMois((prev) => new Set(prev).add(mois));
    startTransition(async () => {
      try {
        const result = await fetchProductionByClient(mois);
        setClientDataByMois((prev) => new Map(prev).set(mois, result));
      } catch {
        toast.error('Erreur lors du chargement des clients');
      } finally {
        setLoadingMois((prev) => {
          const next = new Set(prev);
          next.delete(mois);
          return next;
        });
      }
    });
  }

  function toggleClient(mois: string, clientId: string) {
    const key = `${mois}::${clientId}`;
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    if (projetDataByClient.has(key) || loadingClients.has(key)) return;

    setLoadingClients((prev) => new Set(prev).add(key));
    startTransition(async () => {
      try {
        const result = await fetchProductionByProjet(mois, clientId);
        setProjetDataByClient((prev) => new Map(prev).set(key, result));
        if (onProjetsDiscovered && result.length > 0) {
          onProjetsDiscovered(
            result.flatMap((p) => (p.projetRef ? [p.projetRef] : [])),
          );
        }
      } catch {
        toast.error('Erreur lors du chargement des projets');
      } finally {
        setLoadingClients((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'bg-background border-input hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors',
            )}
          >
            Colonnes
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Groupes de colonnes</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showGroups.mois}
              onCheckedChange={(v) =>
                setShowGroups((s) => ({ ...s, mois: !!v }))
              }
            >
              Mois
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showGroups.soldes}
              onCheckedChange={(v) =>
                setShowGroups((s) => ({ ...s, soldes: !!v }))
              }
            >
              Soldes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showGroups.rolling12}
              onCheckedChange={(v) =>
                setShowGroups((s) => ({ ...s, rolling12: !!v }))
              }
            >
              12 Mois
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showGroups.annee}
              onCheckedChange={(v) =>
                setShowGroups((s) => ({ ...s, annee: !!v }))
              }
            >
              Année
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0">
              <TableHead rowSpan={2} className="align-bottom" />
              {showGroups.mois && (
                <TableHead
                  colSpan={3}
                  className="border-l-2 border-l-emerald-500 text-center text-xs font-semibold tracking-wider uppercase"
                >
                  Mois
                </TableHead>
              )}
              {showGroups.soldes && (
                <TableHead
                  colSpan={3}
                  className="border-l-2 border-l-blue-500 text-center text-xs font-semibold tracking-wider uppercase"
                >
                  Soldes
                </TableHead>
              )}
              {showGroups.rolling12 && (
                <TableHead
                  colSpan={1}
                  className="border-l-accent border-l-2 text-center text-xs font-semibold tracking-wider uppercase"
                >
                  12 Mois
                </TableHead>
              )}
              {showGroups.annee && (
                <TableHead
                  colSpan={1}
                  className="border-l-2 border-l-purple-500 text-center text-xs font-semibold tracking-wider uppercase"
                >
                  Année
                </TableHead>
              )}
            </TableRow>
            <TableRow>
              {showGroups.mois && (
                <>
                  <TableHead className="border-l-2 border-l-emerald-500 text-right">
                    Production
                  </TableHead>
                  <TableHead className="text-right">Facturé</TableHead>
                  <TableHead className="text-right">Encaissé</TableHead>
                </>
              )}
              {showGroups.soldes && (
                <>
                  <TableHead className="border-l-2 border-l-blue-500 text-right">
                    En retard
                  </TableHead>
                  <TableHead className="text-right">RAF</TableHead>
                  <TableHead className="text-right">RAE</TableHead>
                </>
              )}
              {showGroups.rolling12 && (
                <TableHead className="border-l-accent border-l-2 text-right">
                  12M
                </TableHead>
              )}
              {showGroups.annee && (
                <TableHead className="border-l-2 border-l-purple-500 text-right">
                  Année
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsWithYearBreaks.map((item) => {
              if (item.kind === 'banner') {
                return (
                  <TableRow
                    key={'year-' + item.year}
                    className="bg-muted/80 hover:bg-muted/80 sticky top-0 z-10"
                  >
                    <TableCell
                      colSpan={totalColumnCount}
                      className="text-muted-foreground py-2 text-xs font-semibold tracking-wider uppercase"
                    >
                      {item.year}
                    </TableCell>
                  </TableRow>
                );
              }
              const row = item.row;
              const isExpanded = expandedMois.has(row.mois);
              const isLoading = loadingMois.has(row.mois);
              const clients = clientDataByMois.get(row.mois);
              return (
                <ExpandableMonthRows
                  key={row.label}
                  row={row}
                  showGroups={showGroups}
                  isExpanded={isExpanded}
                  isLoading={isLoading}
                  clients={clients}
                  totalColumnCount={totalColumnCount}
                  isSoluvia={isSoluvia}
                  expandedClients={expandedClients}
                  loadingClients={loadingClients}
                  projetDataByClient={projetDataByClient}
                  filterProjets={filterProjets}
                  onToggleMois={() => toggleMois(row.mois)}
                  onToggleClient={(clientId) =>
                    toggleClient(row.mois, clientId)
                  }
                />
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components for expandable rows
// ---------------------------------------------------------------------------

interface ExpandableMonthRowsProps {
  row: MonthRow;
  showGroups: {
    mois: boolean;
    soldes: boolean;
    rolling12: boolean;
    annee: boolean;
  };
  isExpanded: boolean;
  isLoading: boolean;
  clients: ProductionByClientRow[] | undefined;
  totalColumnCount: number;
  isSoluvia: boolean;
  expandedClients: Set<string>;
  loadingClients: Set<string>;
  projetDataByClient: Map<string, ProductionByProjetRow[]>;
  filterProjets: string[];
  onToggleMois: () => void;
  onToggleClient: (clientId: string) => void;
}

// oxlint-disable-next-line react-doctor/no-many-boolean-props
function ExpandableMonthRows({
  row,
  showGroups,
  isExpanded,
  isLoading,
  clients,
  totalColumnCount,
  isSoluvia,
  expandedClients,
  loadingClients,
  projetDataByClient,
  filterProjets,
  onToggleMois,
  onToggleClient,
}: ExpandableMonthRowsProps) {
  return (
    <>
      <TableRow
        data-current-month={row.isCurrent ? 'true' : undefined}
        className={cn(
          'hover:bg-muted/50 cursor-pointer transition-colors',
          row.isCurrent && 'bg-primary/10 font-semibold',
        )}
        onClick={onToggleMois}
      >
        <TableCell className="font-medium">
          <span className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="text-muted-foreground size-3.5" />
            ) : (
              <ChevronRight className="text-muted-foreground size-3.5" />
            )}
            <span
              className={cn(row.isCurrent && 'text-primary font-bold italic')}
            >
              {row.label}
            </span>
          </span>
        </TableCell>
        {showGroups.mois && (
          <>
            <TableCell className="border-l-2 border-l-emerald-500 text-right tabular-nums">
              {formatCurrency(row.production)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isFuture ? '-' : formatCurrency(row.facture)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isFuture ? '-' : formatCurrency(row.encaisse)}
            </TableCell>
          </>
        )}
        {showGroups.soldes && (
          <>
            <TableCell
              className={cn(
                'border-l-2 border-l-blue-500 text-right tabular-nums',
                !row.isFuture &&
                  row.en_retard > 0 &&
                  'font-semibold text-red-600',
              )}
            >
              {row.isFuture ? '-' : formatCurrency(row.en_retard)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.raf)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isFuture ? '-' : formatCurrency(row.rae)}
            </TableCell>
          </>
        )}
        {showGroups.rolling12 && (
          <TableCell className="border-l-accent text-muted-foreground border-l-2 text-right tabular-nums">
            {formatCurrency(row.rolling12)}
          </TableCell>
        )}
        {showGroups.annee && (
          <TableCell className="text-muted-foreground border-l-2 border-l-purple-500 text-right tabular-nums">
            {formatCurrency(row.ytd)}
          </TableCell>
        )}
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={totalColumnCount} className="bg-muted/30 p-0">
            <div className="px-4 py-3">
              {isLoading && (
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="size-3.5 animate-spin" />
                  Chargement des clients…
                </div>
              )}
              {!isLoading && clients && clients.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  Aucune donnée pour ce mois
                </div>
              )}
              {!isLoading && clients && clients.length > 0 && (
                <ClientBreakdownTable
                  clients={clients}
                  isSoluvia={isSoluvia}
                  expandedClients={expandedClients}
                  loadingClients={loadingClients}
                  projetDataByClient={projetDataByClient}
                  filterProjets={filterProjets}
                  mois={row.mois}
                  onToggleClient={onToggleClient}
                />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface ClientBreakdownTableProps {
  clients: ProductionByClientRow[];
  isSoluvia: boolean;
  expandedClients: Set<string>;
  loadingClients: Set<string>;
  projetDataByClient: Map<string, ProductionByProjetRow[]>;
  filterProjets: string[];
  mois: string;
  onToggleClient: (clientId: string) => void;
}

function pickClient(c: ProductionByClientRow, isSoluvia: boolean) {
  return isSoluvia
    ? {
        production: c.productionSoluvia,
        facture: c.factureSoluvia,
        encaisse: c.encaisseSoluvia,
        enRetard: c.enRetardSoluvia,
      }
    : {
        production: c.production,
        facture: c.facture,
        encaisse: c.encaisse,
        enRetard: c.enRetard,
      };
}

function pickProjet(p: ProductionByProjetRow, isSoluvia: boolean) {
  return isSoluvia
    ? {
        production: p.productionSoluvia,
        facture: p.factureSoluvia,
        encaisse: p.encaisseSoluvia,
        enRetard: p.enRetardSoluvia,
      }
    : {
        production: p.production,
        facture: p.facture,
        encaisse: p.encaisse,
        enRetard: p.enRetard,
      };
}

function ClientBreakdownTable({
  clients,
  isSoluvia,
  expandedClients,
  loadingClients,
  projetDataByClient,
  filterProjets,
  mois,
  onToggleClient,
}: ClientBreakdownTableProps) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Client</TableHead>
            <TableHead className="text-right text-xs">Projets</TableHead>
            <TableHead className="text-right text-xs">Production</TableHead>
            <TableHead className="text-right text-xs">Facturé</TableHead>
            <TableHead className="text-right text-xs">Encaissé</TableHead>
            <TableHead className="text-right text-xs">En retard</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => {
            const key = `${mois}::${c.clientId}`;
            const isExpanded = expandedClients.has(key);
            const isLoading = loadingClients.has(key);
            const projets = projetDataByClient.get(key);
            return (
              <ExpandableClientRows
                key={c.clientId}
                client={c}
                isExpanded={isExpanded}
                isLoading={isLoading}
                projets={projets}
                isSoluvia={isSoluvia}
                filterProjets={filterProjets}
                onToggle={() => onToggleClient(c.clientId)}
              />
            );
          })}
          <TableRow className="border-t-2 font-semibold">
            <TableCell>Total</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {clients.reduce((s, r) => s + r.nbProjets, 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  clients.reduce(
                    (s, r) => s + pickClient(r, isSoluvia).production,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  clients.reduce(
                    (s, r) => s + pickClient(r, isSoluvia).facture,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  clients.reduce(
                    (s, r) => s + pickClient(r, isSoluvia).encaisse,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular-nums',
                clients.reduce(
                  (s, r) => s + pickClient(r, isSoluvia).enRetard,
                  0,
                ) > 0 && 'text-red-600',
              )}
            >
              {formatCurrency(
                Math.round(
                  clients.reduce(
                    (s, r) => s + pickClient(r, isSoluvia).enRetard,
                    0,
                  ),
                ),
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

interface ExpandableClientRowsProps {
  client: ProductionByClientRow;
  isExpanded: boolean;
  isLoading: boolean;
  projets: ProductionByProjetRow[] | undefined;
  isSoluvia: boolean;
  filterProjets: string[];
  onToggle: () => void;
}

function ExpandableClientRows({
  client,
  isExpanded,
  isLoading,
  projets,
  isSoluvia,
  filterProjets,
  onToggle,
}: ExpandableClientRowsProps) {
  const view = pickClient(client, isSoluvia);
  return (
    <>
      <TableRow
        className="hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <TableCell className="font-medium">
          <span className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="text-muted-foreground size-3.5" />
            ) : (
              <ChevronRight className="text-muted-foreground size-3.5" />
            )}
            {client.clientName}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground text-right tabular-nums">
          {client.nbProjets}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatCurrency(Math.round(view.production))}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatCurrency(Math.round(view.facture))}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatCurrency(Math.round(view.encaisse))}
        </TableCell>
        <TableCell
          className={cn(
            'text-right tabular-nums',
            view.enRetard > 0 && 'font-semibold text-red-600',
          )}
        >
          {formatCurrency(Math.round(view.enRetard))}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/20 p-0">
            <div className="px-4 py-3">
              {isLoading && (
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="size-3.5 animate-spin" />
                  Chargement des projets…
                </div>
              )}
              {!isLoading && projets && projets.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  Aucun projet pour ce client
                </div>
              )}
              {!isLoading && projets && projets.length > 0 && (
                <ProjetBreakdownTable
                  projets={
                    filterProjets.length === 0
                      ? projets
                      : projets.filter((p) =>
                          filterProjets.includes(p.projetRef),
                        )
                  }
                  isSoluvia={isSoluvia}
                />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ProjetBreakdownTable({
  projets,
  isSoluvia,
}: {
  projets: ProductionByProjetRow[];
  isSoluvia: boolean;
}) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Projet</TableHead>
            <TableHead className="text-right text-xs">Commission</TableHead>
            <TableHead className="text-right text-xs">Contrats</TableHead>
            <TableHead className="text-right text-xs">Production</TableHead>
            <TableHead className="text-right text-xs">Facturé</TableHead>
            <TableHead className="text-right text-xs">Encaissé</TableHead>
            <TableHead className="text-right text-xs">En retard</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projets.map((p) => {
            const view = pickProjet(p, isSoluvia);
            return (
              <TableRow key={p.projetId}>
                <TableCell className="font-medium">{p.projetRef}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {p.commission > 0 ? `${p.commission} %` : '-'}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {p.nbContrats}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Math.round(view.production))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Math.round(view.facture))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Math.round(view.encaisse))}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    view.enRetard > 0 && 'font-semibold text-red-600',
                  )}
                >
                  {formatCurrency(Math.round(view.enRetard))}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-semibold">
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {projets.reduce((s, r) => s + r.nbContrats, 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  projets.reduce(
                    (s, r) => s + pickProjet(r, isSoluvia).production,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  projets.reduce(
                    (s, r) => s + pickProjet(r, isSoluvia).facture,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(
                Math.round(
                  projets.reduce(
                    (s, r) => s + pickProjet(r, isSoluvia).encaisse,
                    0,
                  ),
                ),
              )}
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular-nums',
                projets.reduce(
                  (s, r) => s + pickProjet(r, isSoluvia).enRetard,
                  0,
                ) > 0 && 'text-red-600',
              )}
            >
              {formatCurrency(
                Math.round(
                  projets.reduce(
                    (s, r) => s + pickProjet(r, isSoluvia).enRetard,
                    0,
                  ),
                ),
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
