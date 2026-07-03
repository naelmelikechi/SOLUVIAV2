'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
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

/**
 * Etat + chargement lazy du drill-down (mois -> clients -> projets), separe
 * de MonthlyView pour pouvoir etre PARTAGE entre plusieurs instances : en vue
 * consolidee, les tableaux OPCO et SOLUVIA affichent les memes mois et
 * declenchaient chacun leur propre fetchProductionByClient(mois) (2x la meme
 * requete). Le parent cree un seul hook et le passe aux deux vues.
 */
export function useProductionDrilldown(
  onProjetsDiscovered?: (refs: string[]) => void,
) {
  const [, startTransition] = useTransition();

  const [clientDataByMois, setClientDataByMois] = useState<
    Map<string, ProductionByClientRow[]>
  >(new Map());
  const [loadingMois, setLoadingMois] = useState<Set<string>>(new Set());

  // Cle = `${mois}::${clientId}`
  const [projetDataByClient, setProjetDataByClient] = useState<
    Map<string, ProductionByProjetRow[]>
  >(new Map());
  const [loadingClients, setLoadingClients] = useState<Set<string>>(new Set());

  const loadMois = useCallback(
    (mois: string) => {
      if (clientDataByMois.has(mois) || loadingMois.has(mois)) return;

      setLoadingMois((prev) => new Set(prev).add(mois));
      startTransition(async () => {
        try {
          const result = await fetchProductionByClient(mois);
          if (!result.success) {
            // Pas de mise en cache : le prochain toggle retentera le
            // chargement au lieu d'afficher definitivement "Aucune donnee".
            toast.error(result.error);
            return;
          }
          setClientDataByMois((prev) => new Map(prev).set(mois, result.rows));
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
    },
    [clientDataByMois, loadingMois],
  );

  const loadClient = useCallback(
    (mois: string, clientId: string) => {
      const key = `${mois}::${clientId}`;
      if (projetDataByClient.has(key) || loadingClients.has(key)) return;

      setLoadingClients((prev) => new Set(prev).add(key));
      startTransition(async () => {
        try {
          const result = await fetchProductionByProjet(mois, clientId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setProjetDataByClient((prev) => new Map(prev).set(key, result.rows));
          if (onProjetsDiscovered && result.rows.length > 0) {
            onProjetsDiscovered(
              result.rows.flatMap((p) => (p.projetRef ? [p.projetRef] : [])),
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
    },
    [projetDataByClient, loadingClients, onProjetsDiscovered],
  );

  return {
    clientDataByMois,
    loadingMois,
    projetDataByClient,
    loadingClients,
    loadMois,
    loadClient,
  };
}

export type ProductionDrilldown = ReturnType<typeof useProductionDrilldown>;

interface MonthlyViewProps {
  data: MonthRow[];
  perspective: 'opco' | 'soluvia';
  filterProjets?: string[];
  onProjetsDiscovered?: (refs: string[]) => void;
  /** Drill-down partage entre instances (vue consolidee) ; sinon interne. */
  drilldown?: ProductionDrilldown;
}

const EMPTY_FILTER_PROJETS: string[] = [];

export function MonthlyView({
  data,
  perspective,
  filterProjets = EMPTY_FILTER_PROJETS,
  onProjetsDiscovered,
  drilldown,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: MonthlyViewProps) {
  const ownDrilldown = useProductionDrilldown(onProjetsDiscovered);
  const {
    clientDataByMois,
    loadingMois,
    projetDataByClient,
    loadingClients,
    loadMois,
    loadClient,
  } = drilldown ?? ownDrilldown;

  const [expandedMois, setExpandedMois] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(),
  );

  const [showGroups, setShowGroups] = useState({
    mois: true,
    soldes: true,
    rolling12: false,
    annee: false,
  });

  const isSoluvia = perspective === 'soluvia';
  const isOpco = perspective === 'opco';

  const totalColumnCount =
    1 +
    (showGroups.mois ? (isOpco ? 1 : 3) : 0) +
    (showGroups.soldes && !isOpco ? 3 : 0) +
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

  // L'expansion reste locale a chaque instance (deplier OPCO ne deplie pas
  // SOLUVIA) ; seuls les caches de donnees sont partages via le drilldown.
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
    loadMois(mois);
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
    loadClient(mois, clientId);
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
            {!isOpco && (
              <DropdownMenuCheckboxItem
                checked={showGroups.soldes}
                onCheckedChange={(v) =>
                  setShowGroups((s) => ({ ...s, soldes: !!v }))
                }
              >
                Soldes
              </DropdownMenuCheckboxItem>
            )}
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
                  colSpan={isOpco ? 1 : 3}
                  className="border-l-2 border-l-emerald-500 text-center text-xs font-semibold tracking-wider uppercase"
                >
                  Mois
                </TableHead>
              )}
              {showGroups.soldes && !isOpco && (
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
                  {!isOpco && (
                    <TableHead className="text-right">Facturé</TableHead>
                  )}
                  {!isOpco && (
                    <TableHead className="text-right">Encaissé</TableHead>
                  )}
                </>
              )}
              {showGroups.soldes && !isOpco && (
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
