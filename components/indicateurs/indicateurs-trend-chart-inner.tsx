'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { TrendPoint, KpiKey, KpiFormat } from '@/lib/queries/indicateurs';

interface Props {
  data: TrendPoint[];
  dataKey: KpiKey;
  color: string;
  format: KpiFormat;
  label: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  format,
  name,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
  format: KpiFormat;
  name: string;
}) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  if (!first) return null;
  const value = first.value;
  const formatted =
    format === 'percent'
      ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
      : value.toLocaleString('fr-FR');

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-semibold">Semaine du {label}</p>
      <div className="flex items-center gap-2 text-xs">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: first.color }}
        />
        <span className="text-muted-foreground">{name}</span>
        <span className="ml-auto font-medium tabular-nums">{formatted}</span>
      </div>
    </div>
  );
}

export function IndicateursTrendChartInner({
  data,
  dataKey,
  color,
  format,
  label,
}: Props) {
  const gradientId = `color-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="semaine"
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
            format === 'percent' ? `${v} %` : String(v)
          }
          allowDecimals={format === 'percent'}
        />
        <Tooltip
          content={<CustomTooltip format={format} name={label} />}
          cursor={{ stroke: color, strokeOpacity: 0.3 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={{ r: 3, fill: color }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
