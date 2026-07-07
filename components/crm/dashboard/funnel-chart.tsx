'use client';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Row = { libelle: string; count: number; couleur: string };

export function FunnelChart({ data }: { data: Row[] }) {
  if (!data.some((d) => d.count > 0)) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Aucune opportunité pour l&apos;instant.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 16}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="libelle"
          stroke="var(--muted-foreground)"
          fontSize={12}
          width={130}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--accent)' }}
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          formatter={(value) => [`${value} opp.`, 'Opportunités']}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.couleur || 'var(--primary)'} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
