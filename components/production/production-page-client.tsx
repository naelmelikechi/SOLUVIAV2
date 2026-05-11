'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, FileText, Check, AlertTriangle } from 'lucide-react';
import type { ProductionRow } from '@/lib/queries/production';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';
import {
  ProductionChart,
  type ProductionChartRow,
} from '@/components/production/production-chart';
import { buildDisplayData } from '@/components/production/views/build-display-data';
import { MonthlyView } from '@/components/production/views/monthly-view';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductionPageClient({ data }: { data: ProductionRow[] }) {
  const [perspective, setPerspective] = useState<'opco' | 'soluvia'>('soluvia');

  const displayData = useMemo(
    () => buildDisplayData(data, perspective),
    [data, perspective],
  );

  const currentMonth = displayData.find((m) => m.isCurrent);

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

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="p-3 transition-shadow hover:shadow-md"
          >
            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
              <kpi.icon className={cn('h-3.5 w-3.5', kpi.color)} />
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

      <MonthlyView data={displayData} perspective={perspective} />

      <ProductionChart
        data={displayData.map(
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
