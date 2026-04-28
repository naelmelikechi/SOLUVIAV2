'use client';

import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

export interface ProductionChartRow {
  label: string;
  production: number;
  facture: number;
  encaisse: number;
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

export function ProductionChart({ data }: { data: ProductionChartRow[] }) {
  const hasData = data.some(
    (d) => d.production > 0 || d.facture > 0 || d.encaisse > 0,
  );

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Production vs Facturé vs Encaissé
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[320px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Aucune donnée à afficher
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
          Production vs Facturé vs Encaissé
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RechartsBar data={data} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}
