'use client';

import { useState, useMemo, useRef, useTransition } from 'react';
import { format } from 'date-fns';
import {
  TrendingUp,
  FileText,
  Check,
  AlertTriangle,
  Download,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProductionRow } from '@/lib/queries/dashboard';
import type {
  ProductionByClientRow,
  ProductionByProjetRow,
} from '@/lib/actions/production';
import {
  fetchProductionByClient,
  fetchProductionByProjet,
} from '@/lib/actions/production';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  ProductionChart,
  type ProductionChartRow,
} from '@/components/production/production-chart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MonthRow {
  mois: string; // YYYY-MM-DD
  date: Date;
  label: string;
  production: number;
  facture: number;
  encaisse: number;
  en_retard: number;
  raf: number;
  rae: number;
  rolling12: number;
  ytd: number;
  isFuture: boolean;
  isCurrent: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDisplayData(
  data: ProductionRow[],
  perspective: 'opco' | 'soluvia',
): MonthRow[] {
  const isSoluvia = perspective === 'soluvia';
  const today = new Date();
  const currentKey = format(today, 'yyyy-MM');

  const rows: Omit<MonthRow, 'raf' | 'rae' | 'rolling12' | 'ytd'>[] = data.map(
    (row) => {
      const d = new Date(row.mois + 'T00:00:00');
      const monthKey = row.mois.slice(0, 7);
      const isFuture = monthKey > currentKey;
      const isCurrent = monthKey === currentKey;

      // Production uses real per-contrat commission; other amounts use same ratio
      const ratio =
        row.production > 0 ? row.productionSoluvia / row.production : 0;
      const commission = isSoluvia ? ratio : 1;

      return {
        mois: row.mois,
        date: d,
        label: row.label,
        production: isSoluvia
          ? Math.round(row.productionSoluvia)
          : Math.round(row.production),
        facture: Math.round(row.facture * commission),
        encaisse: Math.round(row.encaisse * commission),
        en_retard: Math.round(row.en_retard * commission),
        isFuture,
        isCurrent,
      };
    },
  );

  // Compute cumulative RAF / RAE + rolling12 + YTD
  let cumulProduction = 0;
  let cumulFacture = 0;
  let cumulEncaisse = 0;

  return rows.map((row, idx) => {
    cumulProduction += row.production;
    cumulFacture += row.facture;
    cumulEncaisse += row.encaisse;

    // Rolling 12 months: sum production from idx-11 to idx
    let rolling12 = 0;
    for (let i = Math.max(0, idx - 11); i <= idx; i++) {
      rolling12 += rows[i]!.production;
    }

    // Year-to-date: sum production from Jan of this row's year to this row
    const rowYear = row.date.getFullYear();
    let ytd = 0;
    for (let i = 0; i <= idx; i++) {
      if (rows[i]!.date.getFullYear() === rowYear) {
        ytd += rows[i]!.production;
      }
    }

    return {
      ...row,
      raf: cumulProduction - cumulFacture,
      rae: cumulFacture - cumulEncaisse,
      rolling12,
      ytd,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionPageClient({ data }: { data: ProductionRow[] }) {
  const [perspective, setPerspective] = useState<'opco' | 'soluvia'>('soluvia');
  const [isPending, startTransition] = useTransition();

  // Drill-down state
  const [drillLevel, setDrillLevel] = useState<'global' | 'client' | 'projet'>(
    'global',
  );
  const [selectedMois, setSelectedMois] = useState<string | null>(null);
  const [selectedMoisLabel, setSelectedMoisLabel] = useState<string | null>(
    null,
  );
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [clientData, setClientData] = useState<ProductionByClientRow[]>([]);
  const [projetData, setProjetData] = useState<ProductionByProjetRow[]>([]);

  const tableRef = useRef<HTMLDivElement>(null);

  const [showGroups, setShowGroups] = useState({
    mois: true,
    soldes: true,
    rolling12: false,
    annee: false,
  });

  const displayData = useMemo(
    () => buildDisplayData(data, perspective),
    [data, perspective],
  );

  const currentMonth = displayData.find((m) => m.isCurrent);

  // Highlight current month row without scrolling the page
  // (scrollIntoView was scrolling the whole page down)

  // Drill-down handlers
  const handleMonthClick = (mois: string, label: string) => {
    setSelectedMois(mois);
    setSelectedMoisLabel(label);
    startTransition(async () => {
      try {
        const result = await fetchProductionByClient(mois);
        setClientData(result);
        setDrillLevel('client');
      } catch {
        toast.error('Erreur lors du chargement des données client');
      }
    });
  };

  const handleClientClick = (clientId: string, clientName: string) => {
    if (!selectedMois) return;
    setSelectedClient({ id: clientId, name: clientName });
    startTransition(async () => {
      try {
        const result = await fetchProductionByProjet(selectedMois, clientId);
        setProjetData(result);
        setDrillLevel('projet');
      } catch {
        toast.error('Erreur lors du chargement des données projet');
      }
    });
  };

  const handleBackToGlobal = () => {
    setDrillLevel('global');
    setSelectedMois(null);
    setSelectedMoisLabel(null);
    setSelectedClient(null);
    setClientData([]);
    setProjetData([]);
  };

  const handleBackToClient = () => {
    setDrillLevel('client');
    setSelectedClient(null);
    setProjetData([]);
  };

  // KPI definitions
  const kpis = [
    {
      label: 'Production du mois',
      value: currentMonth?.production ?? 0,
      icon: TrendingUp,
      color: 'text-emerald-600',
    },
    {
      label: 'Facture du mois',
      value: currentMonth?.facture ?? 0,
      icon: FileText,
      color: 'text-blue-600',
    },
    {
      label: 'Encaisse du mois',
      value: currentMonth?.encaisse ?? 0,
      icon: Check,
      color: 'text-muted-foreground',
    },
    {
      label: 'En retard',
      value: currentMonth?.en_retard ?? 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      valueColor: 'text-red-600',
    },
  ];

  // Export handler
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = displayData.map((m) => ({
      Mois: m.label,
      'Production (€)': m.production,
      'Facturé (€)': m.facture,
      'Encaissé (€)': m.isFuture ? '' : m.encaisse,
      'En retard (€)': m.isFuture ? '' : m.en_retard,
      'RAF (€)': m.raf,
      'RAE (€)': m.rae,
      '12M glissant (€)': m.rolling12,
      'Année (€)': m.ytd,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production');
    XLSX.writeFile(
      wb,
      `production_${perspective}_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  // Compute average commission ratio from data for drill-down display
  const totalProd = data.reduce((s, r) => s + r.production, 0);
  const totalSoluvia = data.reduce((s, r) => s + r.productionSoluvia, 0);
  const avgCommission = totalProd > 0 ? totalSoluvia / totalProd : 0.1;
  const commissionFactor = perspective === 'soluvia' ? avgCommission : 1;

  return (
    <div>
      <PageHeader title="Production" description="Vue financière mensuelle" />

      {/* Toggle OPCO / SOLUVIA */}
      <div className="mb-6 flex items-center gap-2">
        <div className="bg-muted inline-flex rounded-lg p-0.5">
          <Button
            variant={perspective === 'opco' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPerspective('opco')}
          >
            OPCO
          </Button>
          <Button
            variant={perspective === 'soluvia' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPerspective('soluvia')}
          >
            SOLUVIA
          </Button>
        </div>
        <span className="text-muted-foreground text-xs">
          {perspective === 'soluvia'
            ? 'Commission SOLUVIA sur la production'
            : 'Montants bruts OPCO'}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="p-5 transition-shadow hover:shadow-md"
          >
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
              <kpi.icon className={cn('h-4 w-4', kpi.color)} />
              {kpi.label}
            </div>
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                kpi.valueColor && kpi.value > 0 && kpi.valueColor,
              )}
            >
              {formatCurrency(kpi.value)}
            </div>
          </Card>
        ))}
      </div>

      {/* Stacked bar chart (only at global level) */}
      {drillLevel === 'global' && (
        <ProductionChart
          data={displayData
            .filter((m) => !m.isFuture)
            .map(
              (m): ProductionChartRow => ({
                label: m.label,
                production: m.production,
                facture: m.facture,
                encaisse: m.encaisse,
              }),
            )}
        />
      )}

      {/* Breadcrumb navigation */}
      {drillLevel !== 'global' && (
        <div className="mb-4 flex items-center gap-1.5 text-sm">
          <button
            onClick={handleBackToGlobal}
            className="text-primary font-medium hover:underline"
          >
            Production
          </button>
          {selectedMoisLabel && (
            <>
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              {drillLevel === 'projet' ? (
                <button
                  onClick={handleBackToClient}
                  className="text-primary font-medium hover:underline"
                >
                  {selectedMoisLabel}
                </button>
              ) : (
                <span className="font-medium">{selectedMoisLabel}</span>
              )}
            </>
          )}
          {drillLevel === 'projet' && selectedClient && (
            <>
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="font-medium">{selectedClient.name}</span>
            </>
          )}
        </div>
      )}

      {/* Export + Column toggle buttons */}
      {drillLevel === 'global' && (
        <div className="mb-4 flex justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'bg-background border-input hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors',
              )}
            >
              Colonnes
              <ChevronDown className="h-3.5 w-3.5" />
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
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      )}

      {/* Loading overlay */}
      {isPending && (
        <div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Chargement...
        </div>
      )}

      {/* Global monthly table */}
      {drillLevel === 'global' && (
        <Card className="overflow-x-auto" ref={tableRef}>
          <Table>
            <TableHeader>
              {/* Grouped column header row */}
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
              {/* Column sub-headers */}
              <TableRow>
                {showGroups.mois && (
                  <>
                    <TableHead className="border-l-2 border-l-emerald-500 text-right">
                      Production
                    </TableHead>
                    <TableHead className="text-right">Facture</TableHead>
                    <TableHead className="text-right">Encaisse</TableHead>
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
              {displayData.map((row) => (
                <TableRow
                  key={row.label}
                  data-current-month={row.isCurrent ? 'true' : undefined}
                  className={cn(
                    'hover:bg-muted/50 cursor-pointer transition-colors',
                    row.isCurrent && 'bg-primary/10 font-semibold',
                    row.isFuture && 'text-muted-foreground italic',
                  )}
                  onClick={() => handleMonthClick(row.mois, row.label)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {row.isCurrent && (
                        <span className="text-primary mr-1">&#9654;</span>
                      )}
                      {row.label}
                      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </TableCell>
                  {showGroups.mois && (
                    <>
                      <TableCell className="border-l-2 border-l-emerald-500 text-right tabular-nums">
                        {formatCurrency(row.production)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.isFuture ? '\u2014' : formatCurrency(row.facture)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.isFuture ? '\u2014' : formatCurrency(row.encaisse)}
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
                        {row.isFuture
                          ? '\u2014'
                          : formatCurrency(row.en_retard)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.raf)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.isFuture ? '\u2014' : formatCurrency(row.rae)}
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Client drill-down table */}
      {drillLevel === 'client' && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Projets</TableHead>
                <TableHead className="text-right">Production</TableHead>
                <TableHead className="text-right">Facture</TableHead>
                <TableHead className="text-right">Encaisse</TableHead>
                <TableHead className="text-right">En retard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientData.length === 0 && !isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-8 text-center"
                  >
                    Aucune donnee pour ce mois
                  </TableCell>
                </TableRow>
              ) : (
                clientData.map((row) => (
                  <TableRow
                    key={row.clientId}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() =>
                      handleClientClick(row.clientId, row.clientName)
                    }
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {row.clientName}
                        <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {row.nbProjets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.production * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.facture * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.encaisse * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.enRetard > 0 && 'font-semibold text-red-600',
                      )}
                    >
                      {formatCurrency(
                        Math.round(row.enRetard * commissionFactor),
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {/* Totals row */}
              {clientData.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {clientData.reduce((s, r) => s + r.nbProjets, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        clientData.reduce((s, r) => s + r.production, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        clientData.reduce((s, r) => s + r.facture, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        clientData.reduce((s, r) => s + r.encaisse, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      clientData.reduce((s, r) => s + r.enRetard, 0) > 0 &&
                        'text-red-600',
                    )}
                  >
                    {formatCurrency(
                      Math.round(
                        clientData.reduce((s, r) => s + r.enRetard, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Projet drill-down table */}
      {drillLevel === 'projet' && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projet</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Contrats</TableHead>
                <TableHead className="text-right">Production</TableHead>
                <TableHead className="text-right">Facture</TableHead>
                <TableHead className="text-right">Encaisse</TableHead>
                <TableHead className="text-right">En retard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projetData.length === 0 && !isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground py-8 text-center"
                  >
                    Aucune donnee pour ce client
                  </TableCell>
                </TableRow>
              ) : (
                projetData.map((row) => (
                  <TableRow key={row.projetId}>
                    <TableCell className="font-medium">
                      {row.projetRef}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {row.commission > 0 ? `${row.commission} %` : '\u2014'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {row.nbContrats}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.production * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.facture * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(row.encaisse * commissionFactor),
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.enRetard > 0 && 'font-semibold text-red-600',
                      )}
                    >
                      {formatCurrency(
                        Math.round(row.enRetard * commissionFactor),
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {/* Totals row */}
              {projetData.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {projetData.reduce((s, r) => s + r.nbContrats, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        projetData.reduce((s, r) => s + r.production, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        projetData.reduce((s, r) => s + r.facture, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      Math.round(
                        projetData.reduce((s, r) => s + r.encaisse, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      projetData.reduce((s, r) => s + r.enRetard, 0) > 0 &&
                        'text-red-600',
                    )}
                  >
                    {formatCurrency(
                      Math.round(
                        projetData.reduce((s, r) => s + r.enRetard, 0) *
                          commissionFactor,
                      ),
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
