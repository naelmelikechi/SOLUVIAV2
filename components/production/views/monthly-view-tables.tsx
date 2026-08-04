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

/**
 * Cellule montant double HT / TTC (perspective SOLUVIA). Le HT reste la
 * valeur principale, le TTC (valeurs PDF sommees) en sous-ligne discrete.
 */
function DualAmount({ ht, ttc }: { ht: number; ttc?: number }) {
  if (ttc === undefined) return <>{formatCurrency(ht)}</>;
  return (
    <span className="inline-flex flex-col items-end">
      <span>{formatCurrency(ht)}</span>
      <span className="text-muted-foreground text-[10px] leading-tight font-normal">
        {formatCurrency(ttc)} TTC
      </span>
    </span>
  );
}

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
  const isOpco = !isSoluvia;
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
              {isOpco ? (
                formatCurrency(row.production)
              ) : (
                <DualAmount ht={row.production} ttc={row.productionTtc} />
              )}
            </TableCell>
            {!isOpco && (
              <>
                <TableCell className="text-right tabular-nums">
                  {row.isFuture ? (
                    '-'
                  ) : (
                    <DualAmount ht={row.facture} ttc={row.factureTtc} />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.isFuture ? (
                    '-'
                  ) : (
                    <DualAmount ht={row.encaisse} ttc={row.encaisseTtc} />
                  )}
                </TableCell>
              </>
            )}
          </>
        )}
        {showGroups.soldes && !isOpco && (
          <>
            <TableCell
              className={cn(
                'border-l-2 border-l-blue-500 text-right tabular-nums',
                !row.isFuture &&
                  row.en_retard > 0 &&
                  'font-semibold text-red-600',
              )}
            >
              {row.isFuture ? (
                '-'
              ) : (
                <DualAmount ht={row.en_retard} ttc={row.enRetardTtc} />
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <DualAmount ht={row.raf} ttc={row.rafTtc} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isFuture ? (
                '-'
              ) : (
                <DualAmount ht={row.rae} ttc={row.raeTtc} />
              )}
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
  // facture/encaisse/enRetard = montants réels SOLUVIA, communs aux deux
  // perspectives ; seule la production change (NPEC brut OPCO vs commission HT).
  // TTC : sommes des montant_ttc factures (valeurs PDF) ; production TTC =
  // commission contractuelle (x1.2 exact, TTC-native). En OPCO les TTC sont
  // undefined (montants bordereaux, pas de TVA) et l'UI reste simple.
  return {
    production: isSoluvia ? c.productionSoluvia : c.production,
    productionTtc: isSoluvia ? c.productionSoluvia * 1.2 : undefined,
    facture: c.facture,
    encaisse: c.encaisse,
    enRetard: c.enRetard,
    factureTtc: isSoluvia ? c.factureTtc : undefined,
    encaisseTtc: isSoluvia ? c.encaisseTtc : undefined,
    enRetardTtc: isSoluvia ? c.enRetardTtc : undefined,
  };
}

function pickProjet(p: ProductionByProjetRow, isSoluvia: boolean) {
  return {
    production: isSoluvia ? p.productionSoluvia : p.production,
    productionTtc: isSoluvia ? p.productionSoluvia * 1.2 : undefined,
    facture: p.facture,
    encaisse: p.encaisse,
    enRetard: p.enRetard,
    factureTtc: isSoluvia ? p.factureTtc : undefined,
    encaisseTtc: isSoluvia ? p.encaisseTtc : undefined,
    enRetardTtc: isSoluvia ? p.enRetardTtc : undefined,
  };
}

/** Total arrondi d'une colonne du drill-down, en HT + TTC optionnel. */
function DualTotal({
  htValues,
  ttcValues,
}: {
  htValues: number[];
  ttcValues?: (number | undefined)[];
}) {
  const totalHt = Math.round(htValues.reduce((s, v) => s + v, 0));
  const ttcDefined = ttcValues?.every((v) => v !== undefined)
    ? (ttcValues as number[])
    : undefined;
  const totalTtc = ttcDefined
    ? Math.round(ttcDefined.reduce((s, v) => s + v, 0))
    : undefined;
  return <DualAmount ht={totalHt} ttc={totalTtc} />;
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
  const isOpco = !isSoluvia;
  return (
    <div className="border-border bg-background overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Client</TableHead>
            <TableHead className="text-right text-xs">Projets</TableHead>
            <TableHead className="text-right text-xs">Production</TableHead>
            {!isOpco && (
              <>
                <TableHead className="text-right text-xs">Facturé</TableHead>
                <TableHead className="text-right text-xs">Encaissé</TableHead>
                <TableHead className="text-right text-xs">En retard</TableHead>
              </>
            )}
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
              <DualTotal
                htValues={clients.map(
                  (r) => pickClient(r, isSoluvia).production,
                )}
                ttcValues={clients.map(
                  (r) => pickClient(r, isSoluvia).productionTtc,
                )}
              />
            </TableCell>
            {!isOpco && (
              <>
                <TableCell className="text-right tabular-nums">
                  <DualTotal
                    htValues={clients.map(
                      (r) => pickClient(r, isSoluvia).facture,
                    )}
                    ttcValues={clients.map(
                      (r) => pickClient(r, isSoluvia).factureTtc,
                    )}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <DualTotal
                    htValues={clients.map(
                      (r) => pickClient(r, isSoluvia).encaisse,
                    )}
                    ttcValues={clients.map(
                      (r) => pickClient(r, isSoluvia).encaisseTtc,
                    )}
                  />
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
                  <DualTotal
                    htValues={clients.map(
                      (r) => pickClient(r, isSoluvia).enRetard,
                    )}
                    ttcValues={clients.map(
                      (r) => pickClient(r, isSoluvia).enRetardTtc,
                    )}
                  />
                </TableCell>
              </>
            )}
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
  const isOpco = !isSoluvia;
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
          <DualAmount
            ht={Math.round(view.production)}
            ttc={
              view.productionTtc !== undefined
                ? Math.round(view.productionTtc)
                : undefined
            }
          />
        </TableCell>
        {!isOpco && (
          <>
            <TableCell className="text-right tabular-nums">
              <DualAmount
                ht={Math.round(view.facture)}
                ttc={
                  view.factureTtc !== undefined
                    ? Math.round(view.factureTtc)
                    : undefined
                }
              />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <DualAmount
                ht={Math.round(view.encaisse)}
                ttc={
                  view.encaisseTtc !== undefined
                    ? Math.round(view.encaisseTtc)
                    : undefined
                }
              />
            </TableCell>
            <TableCell
              className={cn(
                'text-right tabular-nums',
                view.enRetard > 0 && 'font-semibold text-red-600',
              )}
            >
              <DualAmount
                ht={Math.round(view.enRetard)}
                ttc={
                  view.enRetardTtc !== undefined
                    ? Math.round(view.enRetardTtc)
                    : undefined
                }
              />
            </TableCell>
          </>
        )}
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={isOpco ? 3 : 6} className="bg-muted/20 p-0">
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
  const isOpco = !isSoluvia;
  return (
    <div className="border-border bg-background overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Projet</TableHead>
            <TableHead className="text-right text-xs">Commission</TableHead>
            <TableHead className="text-right text-xs">Contrats</TableHead>
            <TableHead className="text-right text-xs">Production</TableHead>
            {!isOpco && (
              <>
                <TableHead className="text-right text-xs">Facturé</TableHead>
                <TableHead className="text-right text-xs">Encaissé</TableHead>
                <TableHead className="text-right text-xs">En retard</TableHead>
              </>
            )}
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
                  <DualAmount
                    ht={Math.round(view.production)}
                    ttc={
                      view.productionTtc !== undefined
                        ? Math.round(view.productionTtc)
                        : undefined
                    }
                  />
                </TableCell>
                {!isOpco && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      <DualAmount
                        ht={Math.round(view.facture)}
                        ttc={
                          view.factureTtc !== undefined
                            ? Math.round(view.factureTtc)
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <DualAmount
                        ht={Math.round(view.encaisse)}
                        ttc={
                          view.encaisseTtc !== undefined
                            ? Math.round(view.encaisseTtc)
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        view.enRetard > 0 && 'font-semibold text-red-600',
                      )}
                    >
                      <DualAmount
                        ht={Math.round(view.enRetard)}
                        ttc={
                          view.enRetardTtc !== undefined
                            ? Math.round(view.enRetardTtc)
                            : undefined
                        }
                      />
                    </TableCell>
                  </>
                )}
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
              <DualTotal
                htValues={projets.map(
                  (r) => pickProjet(r, isSoluvia).production,
                )}
                ttcValues={projets.map(
                  (r) => pickProjet(r, isSoluvia).productionTtc,
                )}
              />
            </TableCell>
            {!isOpco && (
              <>
                <TableCell className="text-right tabular-nums">
                  <DualTotal
                    htValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).facture,
                    )}
                    ttcValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).factureTtc,
                    )}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <DualTotal
                    htValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).encaisse,
                    )}
                    ttcValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).encaisseTtc,
                    )}
                  />
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
                  <DualTotal
                    htValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).enRetard,
                    )}
                    ttcValues={projets.map(
                      (r) => pickProjet(r, isSoluvia).enRetardTtc,
                    )}
                  />
                </TableCell>
              </>
            )}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
