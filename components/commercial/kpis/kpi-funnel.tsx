'use client';

// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { STAGE_PROSPECT_COLORS } from '@/lib/utils/constants';
import type { BadgeColor } from '@/components/shared/status-badge';
import type { FunnelStep } from '@/lib/queries/commercial-kpis';
import { formatPercent } from '@/lib/utils/formatters';

const HEX_BY_COLOR: Record<BadgeColor, string> = {
  green: '#16a34a',
  orange: '#f59e0b',
  red: '#dc2626',
  blue: '#3b82f6',
  purple: '#a855f7',
  gray: '#9ca3af',
};

interface Props {
  data: FunnelStep[];
}

export function KpiFunnel({ data }: Props) {
  if (!data.some((s) => s.count > 0)) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        Aucun prospect sur ce périmètre
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 48)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 48, left: 0, bottom: 5 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as FunnelStep;
            return (
              <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-md">
                <div className="font-semibold">{row.label}</div>
                <div className="text-muted-foreground tabular-nums">
                  {row.count} prospect{row.count > 1 ? 's' : ''}
                </div>
                {row.conversion !== null && (
                  <div className="text-muted-foreground tabular-nums">
                    Conversion : {formatPercent(row.conversion * 100, 1)}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((row) => (
            <Cell
              key={row.stage}
              fill={HEX_BY_COLOR[STAGE_PROSPECT_COLORS[row.stage]]}
            />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            className="fill-foreground"
            style={{ fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
