'use client';

import dynamic from 'next/dynamic';
import type { InvoiceStatusBreakdown } from '@/lib/queries/dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const RechartsDonut = dynamic(
  () =>
    import('./invoice-status-chart-inner').then((mod) => ({
      default: mod.InvoiceStatusChartInner,
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

export function InvoiceStatusChart({ data }: { data: InvoiceStatusBreakdown }) {
  const total = data.emises + data.payees + data.en_retard + data.avoirs;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Répartition factures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Aucune facture enregistrée
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
          Repartition factures
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RechartsDonut data={data} total={total} />
      </CardContent>
    </Card>
  );
}
