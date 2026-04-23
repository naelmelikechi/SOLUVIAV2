import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { KpiFormat } from '@/lib/queries/indicateurs';

interface Props {
  label: string;
  current: number;
  previous: number;
  format?: KpiFormat;
}

function formatValue(value: number, format?: KpiFormat): string {
  if (format === 'percent') {
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  }
  return value.toLocaleString('fr-FR');
}

function formatDelta(delta: number, format?: KpiFormat): string {
  const sign = delta > 0 ? '+' : '';
  if (format === 'percent') {
    return `${sign}${delta.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pts`;
  }
  return `${sign}${delta.toLocaleString('fr-FR')}`;
}

export function KpiEvolutionCard({ label, current, previous, format }: Props) {
  const deltaRaw = current - previous;
  const delta =
    format === 'percent' ? Math.round(deltaRaw * 10) / 10 : deltaRaw;

  const direction: 'up' | 'down' | 'flat' =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  const Icon =
    direction === 'up'
      ? TrendingUp
      : direction === 'down'
        ? TrendingDown
        : Minus;

  const badgeClass =
    direction === 'up'
      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
      : direction === 'down'
        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
        : 'bg-muted text-muted-foreground';

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-foreground text-3xl font-semibold tabular-nums">
          {formatValue(current, format)}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
              badgeClass,
            )}
          >
            <Icon className="h-3 w-3" />
            {formatDelta(delta, format)}
          </span>
          <span className="text-muted-foreground text-xs">
            vs S-1 ({formatValue(previous, format)})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
