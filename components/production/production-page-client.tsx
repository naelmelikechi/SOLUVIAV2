'use client';

import { Suspense, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  TrendingUp,
  FileText,
  Check,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import type { ProductionRow } from '@/lib/queries/production';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  buildDisplayData,
  type ProductionPerspective,
} from '@/components/production/views/build-display-data';
import { MonthlyView } from '@/components/production/views/monthly-view';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionPageClient(props: { data: ProductionRow[] }) {
  return (
    <Suspense fallback={null}>
      <ProductionPageClientInner {...props} />
    </Suspense>
  );
}

function ProductionPageClientInner({ data }: { data: ProductionRow[] }) {
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const pathname = usePathname();

  const [perspective, setPerspective] =
    useState<ProductionPerspective>('soluvia');

  // Multi-select projet filter - persisted in URL as ?projets=ref1,ref2
  const [filterProjets, setFilterProjets] = useState<string[]>(() => {
    const fromUrl = searchParams.get('projets');
    return fromUrl ? fromUrl.split(',').filter(Boolean) : [];
  });

  // Available projets discovered lazily as users expand rows
  const [availableProjets, setAvailableProjets] = useState<string[]>([]);

  // Sync filter to URL on change
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (filterProjets.length === 0) next.delete('projets');
    else next.set('projets', filterProjets.join(','));
    const qs = next.toString();
    replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    // oxlint-disable-next-line react-doctor/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProjets]);

  // Called by MonthlyView when new projet refs are discovered from lazy loads
  const handleProjetsDiscovered = useCallback((refs: string[]) => {
    setAvailableProjets((prev) => {
      const combined = Array.from(new Set([...prev, ...refs])).sort();
      if (
        combined.length === prev.length &&
        combined.every((r, i) => r === prev[i])
      )
        return prev;
      return combined;
    });
  }, []);

  const displayData = useMemo(() => {
    if (perspective === 'consolide') return null;
    return buildDisplayData(data, perspective);
  }, [data, perspective]);

  const displayDataOpco = useMemo(() => {
    if (perspective !== 'consolide') return null;
    return buildDisplayData(data, 'opco');
  }, [data, perspective]);

  const displayDataSoluvia = useMemo(() => {
    if (perspective !== 'consolide') return null;
    return buildDisplayData(data, 'soluvia');
  }, [data, perspective]);

  // For KPI cards: use OPCO data in consolide mode
  const kpiSource = perspective === 'consolide' ? displayDataOpco : displayData;
  const currentMonth = kpiSource?.find((m) => m.isCurrent);

  const kpis = [
    {
      label: 'Production du mois',
      value: currentMonth?.production ?? 0,
      icon: TrendingUp,
      color: 'text-emerald-600',
    },
    {
      label: 'Facturé du mois',
      value: currentMonth?.facture ?? 0,
      icon: FileText,
      color: 'text-blue-600',
    },
    {
      label: 'Encaissé du mois',
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

  return (
    <div>
      <PageHeader title="Production" description="Vue financière mensuelle" />

      <div className="mb-6 flex flex-wrap items-center gap-2">
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
          <Button
            variant={perspective === 'consolide' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setPerspective('consolide')}
          >
            Consolidé
          </Button>
        </div>
        <span className="text-muted-foreground text-xs">
          {perspective === 'soluvia'
            ? 'Commission SOLUVIA sur la production'
            : perspective === 'opco'
              ? 'Montants bruts OPCO'
              : 'OPCO et SOLUVIA cote a cote'}
        </span>

        {/* Projet multi-select filter */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'bg-background border-input hover:bg-accent hover:text-accent-foreground ml-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors',
              filterProjets.length > 0 && 'border-primary text-primary',
            )}
          >
            Projets
            {filterProjets.length > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold">
                {filterProjets.length}
              </span>
            )}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="flex items-center justify-between gap-4">
              <span>Filtrer par projet</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-[10px] underline"
                  onClick={() => setFilterProjets(availableProjets)}
                >
                  Tout cocher
                </button>
                <span className="text-muted-foreground text-[10px]">/</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-[10px] underline"
                  onClick={() => setFilterProjets([])}
                >
                  Tout decocher
                </button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableProjets.length === 0 ? (
              <div className="text-muted-foreground px-2 py-1.5 text-xs">
                Deployez un mois pour voir les projets
              </div>
            ) : (
              availableProjets.map((ref) => (
                <DropdownMenuCheckboxItem
                  key={ref}
                  checked={filterProjets.includes(ref)}
                  onCheckedChange={(checked) => {
                    setFilterProjets((prev) =>
                      checked ? [...prev, ref] : prev.filter((r) => r !== ref),
                    );
                  }}
                >
                  {ref}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="p-3 transition-shadow hover:shadow-md"
          >
            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
              <kpi.icon className={cn('size-3.5', kpi.color)} />
              {kpi.label}
            </div>
            <div
              className={cn(
                'text-lg font-bold tabular-nums',
                kpi.valueColor && kpi.value > 0 && kpi.valueColor,
              )}
            >
              {formatCurrency(kpi.value)}
            </div>
          </Card>
        ))}
      </div>

      {perspective === 'consolide' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h3 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wider uppercase">
              OPCO
            </h3>
            <MonthlyView
              data={displayDataOpco!}
              perspective="opco"
              filterProjets={filterProjets}
              onProjetsDiscovered={handleProjetsDiscovered}
            />
          </section>
          <section>
            <h3 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wider uppercase">
              SOLUVIA
            </h3>
            <MonthlyView
              data={displayDataSoluvia!}
              perspective="soluvia"
              filterProjets={filterProjets}
              onProjetsDiscovered={handleProjetsDiscovered}
            />
          </section>
        </div>
      ) : (
        <MonthlyView
          data={displayData!}
          perspective={perspective}
          filterProjets={filterProjets}
          onProjetsDiscovered={handleProjetsDiscovered}
        />
      )}

      <ProductionChart
        data={(perspective === 'consolide'
          ? displayDataOpco!
          : displayData!
        ).map(
          (m): ProductionChartRow => ({
            label: m.label,
            production: m.production,
            facture: m.facture,
            encaisse: m.encaisse,
          }),
        )}
      />
    </div>
  );
}
