'use client';

import dynamic from 'next/dynamic';
import type { MonthlyTrendRow } from '@/lib/queries/dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

const RechartsArea = dynamic(
  () =>
    import('./revenue-trend-chart-inner').then((mod) => ({
      default: mod.RevenueTrendChartInner,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="flex h-[280px] items-center justify-center">
      <div className="text-muted-foreground text-sm">Chargement...</div>
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: MonthlyTrendRow[] }) {
  const hasData = data.some(
    (d) => d.production > 0 || d.facture > 0 || d.encaisse > 0,
  );

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Tendance financière
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Aucune donnée sur les 6 derniers mois
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Tendance financière (6 mois)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RechartsArea data={data} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}
