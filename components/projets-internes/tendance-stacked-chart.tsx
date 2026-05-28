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
  Legend,
} from 'recharts';
import { useMemo } from 'react';
import type { TendanceMois } from '@/lib/queries/projets-internes';

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
  data: TendanceMois[];
  /** Categorie code -> libelle pour la legende */
  categoriesLabels: Record<string, string>;
}

const MONTH_LABELS = [
  'janv.',
  'févr.',
  'mars',
  'avril',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function formatMois(mois: string): string {
  const [, mm] = mois.split('-');
  const idx = parseInt(mm ?? '0', 10) - 1;
  return MONTH_LABELS[idx] ?? mois;
}

export function TendanceStackedChart({ data, categoriesLabels }: Props) {
  const { rows, codes } = useMemo(() => {
    const codeSet = new Set<string>();
    for (const row of data) {
      for (const code of Object.keys(row.parCategorie)) {
        if ((row.parCategorie[code] ?? 0) > 0) codeSet.add(code);
      }
    }
    const codes = Array.from(codeSet);

    const rows = data.map((r) => {
      const merged: Record<string, number | string> = {
        mois: formatMois(r.mois),
      };
      for (const c of codes) merged[c] = r.parCategorie[c] ?? 0;
      return merged;
    });

    return { rows, codes };
  }, [data]);

  if (rows.length === 0 || codes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        Pas encore de données sur 12 mois
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const total = payload.reduce(
              (s, p) => s + ((p.value as number) ?? 0),
              0,
            );
            return (
              <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-md">
                <div className="mb-1 font-semibold">{label}</div>
                {payload.flatMap((p) =>
                  ((p.value as number) ?? 0) > 0
                    ? [
                        <div
                          key={p.name as string}
                          className="flex items-center gap-2"
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-muted-foreground">
                            {categoriesLabels[p.name as string] ?? p.name}
                          </span>
                          <span className="ml-auto font-medium tabular-nums">
                            {(p.value as number).toFixed(1)} h
                          </span>
                        </div>,
                      ]
                    : [],
                )}
                <div className="border-border mt-1 flex items-center gap-2 border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span className="ml-auto tabular-nums">
                    {total.toFixed(1)} h
                  </span>
                </div>
              </div>
            );
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) =>
            categoriesLabels[value as string] ?? (value as string)
          }
        />
        {codes.map((c, i) => (
          <Bar
            key={c}
            dataKey={c}
            stackId="cat"
            fill={PALETTE[i % PALETTE.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
