'use client';

import { useState, useMemo, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
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
import type { MonthRow } from './build-display-data';
import { ExpandableMonthRows } from './monthly-view-tables';

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
