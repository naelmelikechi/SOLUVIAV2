// components/dashboard/mini-kpi-card.tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface MiniKpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  sparkline?: React.ReactNode;
  href?: string;
  editMode?: boolean;
  onHide?: () => void;
}

export function MiniKpiCard({
  label,
  value,
  subtitle,
  sparkline,
  href,
  editMode,
  onHide,
}: MiniKpiCardProps) {
  const inner = (
    <>
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className="num mt-1 text-lg font-bold tracking-tight">{value}</div>
      {subtitle && (
        <div className="text-muted-foreground mt-0.5 text-[10px]">
          {subtitle}
        </div>
      )}
      {sparkline && <div className="mt-2">{sparkline}</div>}
    </>
  );

  const isClickable = !!href && !editMode;

  return (
    <div
      className={cn(
        'border-border/60 bg-card relative rounded-lg border p-3 transition-colors',
        isClickable && 'hover:border-foreground/20 cursor-pointer',
      )}
    >
      {editMode && (
        <button
          type="button"
          onClick={() => onHide?.()}
          aria-label={`Masquer ${label}`}
          className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 z-10 inline-flex size-5 items-center justify-center rounded-full border text-[10px]"
        >
          ×
        </button>
      )}
      {isClickable ? (
        <Link href={href} aria-label={`Voir : ${label}`} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
