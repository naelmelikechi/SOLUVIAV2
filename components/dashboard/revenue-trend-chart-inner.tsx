'use client';

// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { MonthlyTrendRow } from '@/lib/queries/dashboard';

interface Props {
  data: MonthlyTrendRow[];
  formatCurrency: (v: number) => string;
}

const LEGEND_LABELS: Record<string, string> = {
  production: 'Production',
  facture: 'Facturé',
  encaisse: 'Encaissé',
};

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
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {LEGEND_LABELS[entry.name] ?? entry.name}
          </span>
          <span className="ml-auto font-medium tabular-nums">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function renderLegendText(value: string) {
  return LEGEND_LABELS[value] ?? value;
}

export function RevenueTrendChartInner({ data, formatCurrency }: Props) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="mois"
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
        <Tooltip
          content={<CustomTooltip formatCurrency={formatCurrency} />}
          cursor={false}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={renderLegendText}
        />
        <Line
          type="monotone"
          dataKey="production"
          name="production"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22c55e' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="facture"
          name="facture"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: '#3b82f6' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="encaisse"
          name="encaisse"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3, fill: '#f97316' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
