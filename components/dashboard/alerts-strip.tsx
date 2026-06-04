// components/dashboard/alerts-strip.tsx
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Alert = {
  count: number;
  title: string;
  href: string;
  color: 'red' | 'orange' | 'blue';
};

const dotColor: Record<Alert['color'], string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
};

export function AlertsStrip({
  alerts,
  editMode,
  onHide,
}: {
  alerts: Alert[];
  editMode?: boolean;
  onHide?: () => void;
}) {
  const hideButton = editMode ? (
    <button
      type="button"
      onClick={() => onHide?.()}
      aria-label="Masquer les alertes"
      className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute -top-2 -right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border text-xs"
    >
      ×
    </button>
  ) : null;

  if (alerts.length === 0) {
    return (
      <div className="relative">
        {hideButton}
        <div className="border-border/60 flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2 text-xs dark:bg-green-950/20">
          <CheckCircle2 className="size-3.5 text-green-600" />
          <span className="font-medium text-green-700 dark:text-green-300">
            Tout est sous controle
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {hideButton}
      <div className="border-border/60 bg-card flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-3 py-2 text-xs">
        {alerts.map((a) => (
          <Link
            key={`${a.href}:${a.title}`}
            href={a.href}
            className="hover:text-foreground text-muted-foreground flex items-center gap-1.5 transition-colors"
          >
            <span
              className={cn(
                'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                dotColor[a.color],
              )}
            >
              {a.count}
            </span>
            <span className="font-medium">{a.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
