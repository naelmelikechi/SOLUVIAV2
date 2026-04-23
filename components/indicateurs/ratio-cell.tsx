import { cn } from '@/lib/utils';

export type RatioKind = 'progression' | 'rdv' | 'qualite' | 'facturation';

interface RatioCellProps {
  realise: number;
  total: number;
  kind: RatioKind;
  enRetard?: number;
}

const GREEN_THRESHOLD = 80;

function computePercentage(realise: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((realise / total) * 100);
}

function getSubText(
  kind: RatioKind,
  realise: number,
  total: number,
  pct: number | null,
  enRetard: number,
): string {
  if (kind === 'facturation') {
    if (enRetard > 0) return `${enRetard} en retard`;
    if (total === 0) return 'rien à émettre';
    return 'à jour';
  }
  if (total === 0) {
    if (kind === 'progression') return 'aucun apprenant';
    if (kind === 'rdv') return 'aucun RDV';
    return 'aucune tâche';
  }
  const missing = total - realise;
  if (pct != null && pct >= GREEN_THRESHOLD) return 'à jour';
  if (kind === 'progression') return `${missing} à risque`;
  return `${missing} à risque`;
}

export function RatioCell({
  realise,
  total,
  kind,
  enRetard = 0,
}: RatioCellProps) {
  const pct = computePercentage(realise, total);
  const isGreen = pct != null && pct >= GREEN_THRESHOLD;
  const subText = getSubText(kind, realise, total, pct, enRetard);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-foreground font-medium tabular-nums">
          {realise}/{total}
          {pct != null && (
            <span className="text-muted-foreground ml-1 text-xs">({pct}%)</span>
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            total === 0
              ? 'bg-muted-foreground/30'
              : isGreen
                ? 'bg-emerald-500'
                : 'bg-red-500',
          )}
        />
      </div>
      <span className="text-muted-foreground text-xs">{subText}</span>
    </div>
  );
}
