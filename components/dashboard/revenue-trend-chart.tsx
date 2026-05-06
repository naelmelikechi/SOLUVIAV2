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
  // Le helper renvoie 12 mois (sparklines KPI) : on slice les 6 derniers
  // pour ce chart qui historiquement etait sur 6 mois.
  const last6 = data.slice(-6);
  const hasData = last6.some(
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
        <RechartsArea data={last6} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}
