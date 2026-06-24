'use client';

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type {
  ProductionByClientRow,
  ProductionByProjetRow,
} from '@/lib/actions/production';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import type { MonthRow } from './build-display-data';

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
export function ExpandableMonthRows({
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
