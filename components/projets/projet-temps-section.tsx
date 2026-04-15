import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetTempsStats } from '@/lib/queries/projets';
import { formatHeures } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';

export function ProjetTempsSection({
  temps,
}: {
  temps: ProjetTempsStats | null;
}) {
  if (!temps || temps.total === 0) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Temps</h3>
        <p className="text-muted-foreground text-sm">Aucune saisie ce mois</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Temps — {temps.mois_label}</h3>
        <span className="text-sm font-semibold">
          Total : {formatHeures(temps.total)}
        </span>
      </div>

      <div className="space-y-3">
        {temps.axes.map((axe) => {
          const pct = temps.total > 0 ? (axe.heures / temps.total) * 100 : 0;
          return (
            <div key={axe.code}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{axe.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatHeures(axe.heures)}{' '}
                  <span className="text-xs">({Math.round(pct)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--border-light)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: axe.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/temps"
        className="text-primary hover:text-primary/80 mt-3 inline-flex items-center gap-1 text-xs font-medium"
      >
        Voir le suivi de temps
        <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}
