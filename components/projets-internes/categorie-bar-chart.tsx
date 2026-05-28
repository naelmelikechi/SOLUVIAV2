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
} from 'recharts';
import type { CategorieStats } from '@/lib/queries/projets-internes';

const PALETTE = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
];

interface Props {
  data: CategorieStats[];
}

export function CategorieBarChart({ data }: Props) {
  const sorted = [...data]
    .filter((d) => d.heures > 0)
    .sort((a, b) => b.heures - a.heures);

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        Aucune heure interne sur la période
      </div>
    );
  }

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(260, sorted.length * 44)}
    >
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
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
        />
        <YAxis
          type="category"
          dataKey="libelle"
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as CategorieStats;
            return (
              <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-md">
                <div className="font-semibold">{row.libelle}</div>
                <div className="text-muted-foreground tabular-nums">
                  {row.heures.toFixed(1)} h - {row.pct.toFixed(1)}%
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="heures" radius={[0, 4, 4, 0]}>
          {sorted.map((row, i) => (
            <Cell key={row.libelle} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
