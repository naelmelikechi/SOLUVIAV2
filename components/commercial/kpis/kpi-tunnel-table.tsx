'use client';

import type { TunnelComparisonRow } from '@/lib/queries/commercial-kpis';

interface Props {
  rows: TunnelComparisonRow[];
}

export function KpiTunnelTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="py-2 pr-4 font-medium">Tunnel</th>
            <th className="py-2 pr-4 font-medium">Volume actif</th>
            <th className="py-2 pr-4 font-medium">Signatures</th>
            <th className="py-2 pr-4 font-medium">Apprenants signés</th>
            <th className="py-2 pr-4 font-medium">Ticket moyen</th>
            <th className="py-2 font-medium">Cycle médian</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tunnel} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{r.label}</td>
              <td className="py-2 pr-4 tabular-nums">{r.volumeActif}</td>
              <td className="py-2 pr-4 tabular-nums">{r.signatures}</td>
              <td className="py-2 pr-4 tabular-nums">{r.apprenantsSignes}</td>
              <td className="py-2 pr-4 tabular-nums">{r.ticketMoyen}</td>
              <td className="py-2 tabular-nums">{r.cycleMedianJours} j</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
