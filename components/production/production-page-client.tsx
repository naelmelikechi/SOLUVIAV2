'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  TrendingUp,
  FileText,
  Check,
  AlertTriangle,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ProductionRow } from '@/lib/queries/dashboard';
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
  date: Date;
  label: string;
  production: number;
  facture: number;
  encaisse: number;
  en_retard: number;
  raf: number;
  rae: number;
  isFuture: boolean;
  isCurrent: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_COMMISSION = 0.1;

function buildDisplayData(
  data: ProductionRow[],
  perspective: 'opco' | 'soluvia',
): MonthRow[] {
  const commission = perspective === 'soluvia' ? DEFAULT_COMMISSION : 1;
  const today = new Date();
  const currentKey = format(today, 'yyyy-MM');

  const rows: Omit<MonthRow, 'raf' | 'rae'>[] = data.map((row) => {
    const d = new Date(row.mois + 'T00:00:00');
    const monthKey = row.mois.slice(0, 7);
    const isFuture = monthKey > currentKey;
    const isCurrent = monthKey === currentKey;

    return {
      date: d,
      label: row.label,
      production: Math.round(row.production * commission),
      facture: Math.round(row.facture * commission),
      encaisse: Math.round(row.encaisse * commission),
      en_retard: Math.round(row.en_retard * commission),
      isFuture,
      isCurrent,
    };
  });

  // Compute cumulative RAF / RAE
  let cumulProduction = 0;
  let cumulFacture = 0;
  let cumulEncaisse = 0;

  return rows.map((row) => {
    cumulProduction += row.production;
    cumulFacture += row.facture;
    cumulEncaisse += row.encaisse;

    return {
      ...row,
      raf: cumulProduction - cumulFacture,
      rae: cumulFacture - cumulEncaisse,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionPageClient({ data }: { data: ProductionRow[] }) {
  const [perspective, setPerspective] = useState<'opco' | 'soluvia'>('opco');

  const displayData = useMemo(
    () => buildDisplayData(data, perspective),
    [data, perspective],
  );

  const currentMonth = displayData.find((m) => m.isCurrent);

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
  const handleExport = () => {
    const rows = displayData.map((m) => ({
      Mois: m.label,
      'Production (€)': m.production,
      'Facturé (€)': m.facture,
      'Encaissé (€)': m.isFuture ? '' : m.encaisse,
      'En retard (€)': m.isFuture ? '' : m.en_retard,
      'RAF (€)': m.raf,
      'RAE (€)': m.rae,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production');
    XLSX.writeFile(
      wb,
      `production_${perspective}_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

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
            ? 'Commission 10 % sur la production'
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

      {/* Stacked bar chart */}
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

      {/* Export button */}
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {/* Monthly Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mois</TableHead>
              <TableHead className="text-right">Production</TableHead>
              <TableHead className="text-right">Facturé</TableHead>
              <TableHead className="text-right">Encaissé</TableHead>
              <TableHead className="text-right">En retard</TableHead>
              <TableHead className="text-right">RAF</TableHead>
              <TableHead className="text-right">RAE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.map((row) => (
              <TableRow
                key={row.label}
                className={cn(
                  row.isCurrent && 'bg-primary/10 font-semibold',
                  row.isFuture && 'text-muted-foreground italic',
                )}
              >
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.production)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.isFuture ? '—' : formatCurrency(row.facture)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.isFuture ? '—' : formatCurrency(row.encaisse)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    !row.isFuture &&
                      row.en_retard > 0 &&
                      'font-semibold text-red-600',
                  )}
                >
                  {row.isFuture ? '—' : formatCurrency(row.en_retard)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.raf)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.isFuture ? '—' : formatCurrency(row.rae)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
