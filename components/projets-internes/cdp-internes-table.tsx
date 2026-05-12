'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CdpStats } from '@/lib/queries/projets-internes';

interface Props {
  data: CdpStats[];
}

export function CdpInternesTable({ data }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        Aucune saisie temps sur la période
      </div>
    );
  }

  const displayed = showAll ? data : data.slice(0, 10);

  return (
    <div>
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Collaborateur</th>
              <th className="px-3 py-2 text-right">Heures internes</th>
              <th className="px-3 py-2 text-right">Heures client</th>
              <th className="px-3 py-2 text-right">Ratio interne</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((u) => (
              <tr
                key={u.user_id}
                className="border-border/60 hover:bg-muted/30 border-t"
              >
                <td className="px-3 py-2 font-medium">
                  {u.prenom} {u.nom}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {u.heuresInternes.toFixed(1)} h
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {u.heuresClient.toFixed(1)} h
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {u.ratio !== null ? (
                    <span
                      className={cn(
                        'font-semibold',
                        u.ratio >= 40
                          ? 'text-amber-700'
                          : u.ratio >= 25
                            ? 'text-foreground'
                            : 'text-muted-foreground',
                      )}
                    >
                      {u.ratio.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-muted-foreground hover:text-foreground mt-2 text-xs"
        >
          {showAll
            ? 'Réduire'
            : `Voir tous (${data.length - 10} de plus)`}
        </button>
      )}
    </div>
  );
}
