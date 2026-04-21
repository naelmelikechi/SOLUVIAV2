'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  ProductionPageData,
  ProductionRow,
} from '@/lib/queries/production';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import type { FilterOption } from '@/components/shared/data-table';
import { ProductionChart } from '@/components/production/production-chart';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------------
// KPI chip (displayed in the page header, aligned with the title)
// -----------------------------------------------------------------------------

interface KpiChipProps {
  label: string;
  value: number;
  tone: 'opco' | 'soluvia';
  subdued?: boolean;
}

function KpiChip({ label, value, tone, subdued }: KpiChipProps) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-md border px-3 py-1.5 text-xs',
        tone === 'opco'
          ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30'
          : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30',
        subdued && 'opacity-80',
      )}
    >
      <span
        className={cn(
          'text-[10px] font-semibold tracking-wide uppercase',
          tone === 'opco'
            ? 'text-blue-700 dark:text-blue-300'
            : 'text-emerald-700 dark:text-emerald-300',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-sm font-semibold tabular-nums',
          tone === 'opco'
            ? 'text-blue-900 dark:text-blue-100'
            : 'text-emerald-900 dark:text-emerald-100',
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Column factory
// -----------------------------------------------------------------------------

function createColumns(): ColumnDef<ProductionRow>[] {
  return [
    {
      accessorKey: 'projetRef',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Projet" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-primary font-mono text-sm font-bold">
            {row.original.projetRef}
          </span>
          <span className="text-muted-foreground text-xs">
            {row.original.clientName}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'monthLabel',
      id: 'mois',
      accessorFn: (row) => row.monthKey,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Mois" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.monthLabel}</span>
      ),
      sortingFn: (a, b) =>
        a.original.monthKey.localeCompare(b.original.monthKey),
    },
    {
      accessorKey: 'montantOpco',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="OPCO" />
      ),
      cell: ({ row }) => (
        <div className="-mx-4 -my-2 bg-blue-50/60 px-4 py-2 dark:bg-blue-950/30">
          <span className="font-mono text-sm font-semibold text-blue-900 tabular-nums dark:text-blue-100">
            {formatCurrency(row.original.montantOpco)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'montantSoluvia',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="SOLUVIA" />
      ),
      cell: ({ row }) => (
        <div className="-mx-4 -my-2 bg-emerald-50/60 px-4 py-2 dark:bg-emerald-950/30">
          <span className="font-mono text-sm font-semibold text-emerald-900 tabular-nums dark:text-emerald-100">
            {formatCurrency(row.original.montantSoluvia)}
          </span>
        </div>
      ),
    },
  ];
}

// -----------------------------------------------------------------------------
// Year selector
// -----------------------------------------------------------------------------

function YearSelector({
  year,
  currentYear,
}: {
  year: number;
  currentYear: number;
}) {
  const router = useRouter();
  const go = (nextYear: number) => {
    const url =
      nextYear === currentYear ? '/production' : `/production?year=${nextYear}`;
    router.push(url);
  };
  return (
    <div className="border-border bg-card inline-flex items-center rounded-md border">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => go(year - 1)}
        aria-label="Année précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="px-3 font-mono text-sm font-semibold tabular-nums">
        {year}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => go(year + 1)}
        aria-label="Année suivante"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {year !== currentYear && (
        <Button
          variant="ghost"
          size="sm"
          className="mr-1 ml-1"
          onClick={() => go(currentYear)}
        >
          Aujourd&apos;hui
        </Button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

export function ProductionPageClient({ data }: { data: ProductionPageData }) {
  const router = useRouter();
  const columns = useMemo(() => createColumns(), []);
  const { year, rows, kpis, monthlyTotals } = data;
  const currentYear = new Date().getFullYear();

  const clientFilter: FilterOption = useMemo(() => {
    const uniqueClients = Array.from(
      new Set(rows.map((r) => r.clientName).filter(Boolean)),
    ).sort();
    return {
      column: 'projetRef',
      label: 'Client',
      options: uniqueClients.map((c) => ({ label: c, value: c })),
    };
  }, [rows]);

  const filters = useMemo<FilterOption[]>(
    () => (clientFilter.options.length > 0 ? [clientFilter] : []),
    [clientFilter],
  );

  const handleRowClick = (row: ProductionRow) => {
    if (row.projetRef) {
      router.push(`/projets/${row.projetRef}`);
    }
  };

  return (
    <div>
      <PageHeader
        title="Production"
        description="Prévisionnel théorique par projet et par mois"
      >
        <KpiChip
          label={`OPCO ${year}`}
          value={kpis.totalOpcoYear}
          tone="opco"
        />
        <KpiChip
          label={`SOLUVIA ${year}`}
          value={kpis.totalSoluviaYear}
          tone="soluvia"
        />
        <KpiChip
          label="OPCO mois"
          value={kpis.totalOpcoCurrentMonth}
          tone="opco"
          subdued
        />
        <KpiChip
          label="SOLUVIA mois"
          value={kpis.totalSoluviaCurrentMonth}
          tone="soluvia"
          subdued
        />
      </PageHeader>

      <div className="mb-3 flex items-center justify-between gap-2">
        <YearSelector year={year} currentYear={currentYear} />
        <span className="text-muted-foreground text-xs">
          {rows.length} lignes · projection théorique (OPCO 40/30/20/10, SOLUVIA
          12 × 1/12 à partir de M+3)
        </span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchKey="projetRef"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
        defaultSort={{ id: 'projetRef', desc: false }}
        filters={filters}
      />

      <div className="mt-6">
        <ProductionChart data={monthlyTotals} year={year} />
      </div>
    </div>
  );
}
