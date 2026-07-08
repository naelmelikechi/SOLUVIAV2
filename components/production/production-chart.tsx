'use client';

import { memo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

import type { ProductionChartRow } from './production-chart-inner';

export type { ProductionChartRow } from './production-chart-inner';

const RechartsLine = dynamic(
  () =>
    import('./production-chart-inner').then((mod) => ({
      default: mod.ProductionChartInner,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="flex h-[320px] items-center justify-center">
      <div className="text-muted-foreground text-sm">Chargement…</div>
    </div>
  );
}

// memo : le parent memoise data (useMemo), le graphe recharts ne doit se
// re-rendre que quand les donnees ou la perspective changent, pas a chaque
// interaction de la page (filtres, expansion de lignes).
export const ProductionChart = memo(function ProductionChart({
  data,
  productionOnly = false,
}: {
  data: ProductionChartRow[];
  productionOnly?: boolean;
}) {
  const hasData = data.some((d) =>
    productionOnly
      ? d.production > 0
      : d.production > 0 || d.facture > 0 || d.encaisse > 0,
  );

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {productionOnly
              ? 'Production (montants bruts OPCO)'
              : 'Production vs Facturé vs Encaissé'}
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
          {productionOnly
            ? 'Production (montants bruts OPCO)'
            : 'Production vs Facturé vs Encaissé'}
        </CardTitle>
        {!productionOnly && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Trois vues du même euro de commission, qui ne se superposent pas
            mois par mois (c&apos;est normal) :{' '}
            <span className="font-medium">Production</span> = commission lissée
            sur toute la durée du contrat (pilotage) ;{' '}
            <span className="font-medium">Facturé</span> = factures réellement
            émises ce mois ; <span className="font-medium">Encaissé</span> =
            règlements OPCO reçus (ramenés en HT).
          </p>
        )}
      </CardHeader>
      <CardContent>
        <RechartsLine
          data={data}
          formatCurrency={formatCurrency}
          productionOnly={productionOnly}
        />
      </CardContent>
    </Card>
  );
});
