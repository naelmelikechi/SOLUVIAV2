'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import type { InvoiceStatusBreakdown } from '@/lib/queries/dashboard';

interface Props {
  data: InvoiceStatusBreakdown;
  total: number;
}

const CHART_DATA_KEYS: {
  key: keyof InvoiceStatusBreakdown;
  label: string;
  color: string;
}[] = [
  { key: 'emises', label: 'Emises', color: '#3b82f6' },
  { key: 'payees', label: 'Payees', color: '#22c55e' },
  { key: 'en_retard', label: 'En retard', color: '#ef4444' },
  { key: 'avoirs', label: 'Avoirs', color: '#f97316' },
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { fill: string; percent: number };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: entry.payload.fill }}
        />
        <span className="font-medium">{entry.name}</span>
        <span className="ml-2 tabular-nums">{entry.value}</span>
        <span className="text-muted-foreground">
          ({Math.round(entry.payload.percent * 100)}%)
        </span>
      </div>
    </div>
  );
}

function renderLegendText(value: string) {
  return <span className="text-xs">{value}</span>;
}

export function InvoiceStatusChartInner({ data, total }: Props) {
  const chartData = CHART_DATA_KEYS.filter((d) => data[d.key] > 0).map((d) => ({
    name: d.label,
    value: data[d.key],
    fill: d.color,
    percent: data[d.key] / total,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={renderLegendText}
        />
        {/* Center label */}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-2xl font-bold"
        >
          {total}
        </text>
        <text
          x="50%"
          y="57%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground text-xs"
        >
          factures
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
