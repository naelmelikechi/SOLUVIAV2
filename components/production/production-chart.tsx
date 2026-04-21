'use client';

import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

export interface ProductionChartRow {
  /** Short label shown on the X axis */
  monthLabel: string;
  opco: number;
  soluvia: number;
}

const RechartsBar = dynamic(
  () =>
    import('./production-chart-inner').then((mod) => ({
      default: mod.ProductionChartInner,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="flex h-[320px] items-center justify-center">
      <div className="text-muted-foreground text-sm">Chargement...</div>
    </div>
  );
}

export function ProductionChart({
  data,
  year,
}: {
  data: ProductionChartRow[];
  year: number;
}) {
  const hasData = data.some((d) => d.opco > 0 || d.soluvia > 0);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Prévisionnel mensuel {year} - OPCO vs SOLUVIA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[320px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Aucune donnée à afficher pour {year}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Prévisionnel mensuel {year} - OPCO vs SOLUVIA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RechartsBar data={data} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}
