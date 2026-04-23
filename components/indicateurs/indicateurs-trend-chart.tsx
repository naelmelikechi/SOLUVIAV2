'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TrendPoint, KpiKey, KpiFormat } from '@/lib/queries/indicateurs';

const ChartInner = dynamic(
  () =>
    import('./indicateurs-trend-chart-inner').then((mod) => ({
      default: mod.IndicateursTrendChartInner,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="flex h-[300px] items-center justify-center">
      <div className="text-muted-foreground text-sm">Chargement...</div>
    </div>
  );
}

interface SeriesConfig {
  key: KpiKey;
  label: string;
  color: string;
  format: KpiFormat;
}

const SERIES: SeriesConfig[] = [
  {
    key: 'rdvFormateurs',
    label: 'RDV formateurs',
    color: '#3b82f6',
    format: 'number',
  },
  {
    key: 'rdvCommerciaux',
    label: 'RDV commerciaux',
    color: '#8b5cf6',
    format: 'number',
  },
  {
    key: 'apprenantsApportes',
    label: 'Apprenants apportés',
    color: '#22c55e',
    format: 'number',
  },
  {
    key: 'tachesQualite',
    label: 'Tâches qualité',
    color: '#f97316',
    format: 'number',
  },
  {
    key: 'ideesImplementees',
    label: 'Idées implémentées',
    color: '#eab308',
    format: 'number',
  },
  {
    key: 'progressionMoyenne',
    label: 'Progression moyenne',
    color: '#ec4899',
    format: 'percent',
  },
];

export function IndicateursTrendChart({
  data,
  allowedKeys,
}: {
  data: TrendPoint[];
  allowedKeys?: KpiKey[];
}) {
  const visibleSeries =
    allowedKeys && allowedKeys.length > 0
      ? SERIES.filter((s) => allowedKeys.includes(s.key))
      : SERIES;
  const fallback = visibleSeries[0] ?? SERIES[0]!;
  const [selected, setSelected] = useState<KpiKey>(fallback.key);
  const active = visibleSeries.find((s) => s.key === selected) ?? fallback;

  const hasData = data.some((d) => {
    const v = d[active.key];
    return typeof v === 'number' && v > 0;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">
            Évolution sur 8 semaines
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {visibleSeries.map((s) => (
              <Button
                key={s.key}
                variant={s.key === selected ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelected(s.key)}
                className={cn(s.key === selected && 'shadow-sm', 'text-[11px]')}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartInner
            data={data}
            dataKey={active.key}
            color={active.color}
            format={active.format}
            label={active.label}
          />
        ) : (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Aucune donnée sur les 8 dernières semaines
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
