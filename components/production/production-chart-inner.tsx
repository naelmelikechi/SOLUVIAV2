'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ProductionChartRow } from './production-chart';

interface Props {
  data: ProductionChartRow[];
  formatCurrency: (v: number) => string;
}

function CustomTooltip({
  active,
  payload,
  label,
  formatCurrency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  formatCurrency: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-semibold">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const LEGEND_LABELS: Record<string, string> = {
  production: 'Production',
  facture: 'Facture',
  encaisse: 'Encaisse',
};

function renderLegendText(value: string) {
  return LEGEND_LABELS[value] ?? value;
}

export function ProductionChartInner({ data, formatCurrency }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
          }
        />
        <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={renderLegendText}
        />
        <Bar
          dataKey="production"
          name="production"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
        <Bar
          dataKey="facture"
          name="facture"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
        <Bar
          dataKey="encaisse"
          name="encaisse"
          fill="#f97316"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
