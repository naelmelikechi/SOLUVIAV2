import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetTempsStats } from '@/lib/queries/projets';
import { formatHeures } from '@/lib/utils/formatters';
import { Card } from '@/components/ui/card';

const MONTH_LABELS_SHORT = [
  'J',
  'F',
  'M',
  'A',
  'M',
  'J',
  'J',
  'A',
  'S',
  'O',
  'N',
  'D',
];

export function ProjetTempsSection({
  temps,
}: {
  temps: ProjetTempsStats | null;
}) {
  if (!temps || (temps.total === 0 && temps.totalAnnee === 0)) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Temps</h3>
        <p className="text-muted-foreground text-sm">
          Aucune saisie cette année
        </p>
      </Card>
    );
  }

  const maxHeures = Math.max(1, ...temps.sparkline.map((m) => m.heures));
  const currentMonthIdx = new Date().getMonth();

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Temps</h3>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">
            {temps.mois_label} :{' '}
            <span className="text-foreground font-semibold tabular-nums">
              {formatHeures(temps.total)}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5">
            Cumul {temps.annee} :{' '}
            <span className="text-foreground font-semibold tabular-nums">
              {formatHeures(temps.totalAnnee)}
            </span>
          </div>
        </div>
      </div>

      {/* Mini sparkline 12 mois - mois courant en plein, autres muted */}
      <div className="mb-4 flex h-12 items-end gap-1">
        {temps.sparkline.map((m) => {
          const pct = (m.heures / maxHeures) * 100;
          const isCurrent = m.mois === currentMonthIdx;
          const isFuture = m.mois > currentMonthIdx;
          return (
            <div
              key={m.mois}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${MONTH_LABELS_SHORT[m.mois]} : ${formatHeures(m.heures)}`}
            >
              <div className="flex h-10 w-full items-end">
                <div
                  className={`w-full rounded-sm ${
                    isFuture
                      ? 'bg-[var(--border-light)]'
                      : isCurrent
                        ? 'bg-primary'
                        : 'bg-[var(--border)]'
                  }`}
                  style={{
                    height: `${pct}%`,
                    minHeight: m.heures > 0 ? 2 : 0,
                  }}
                />
              </div>
              <span
                className={`text-[9px] tabular-nums ${
                  isCurrent
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {MONTH_LABELS_SHORT[m.mois]}
              </span>
            </div>
          );
        })}
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
