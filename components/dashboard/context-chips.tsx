import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/formatters';

export interface ContextChipsProps {
  enRetard: number;
  aFacturer: number;
  weekHours: number;
  editMode?: boolean;
  onHide?: () => void;
}

type ChipTone = 'danger' | 'info' | 'warn' | 'ok';

interface ChipDef {
  key: string;
  label: string;
  value: string;
  href: string;
  cta: string;
  tone: ChipTone;
}

const dotTone: Record<ChipTone, string> = {
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  warn: 'bg-orange-500',
  ok: 'bg-green-500',
};

const valueTone: Record<ChipTone, string> = {
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-foreground',
  warn: 'text-foreground',
  ok: 'text-foreground',
};

export function ContextChips({
  enRetard,
  aFacturer,
  weekHours,
  editMode,
  onHide,
}: ContextChipsProps) {
  const chips: ChipDef[] = [];

  if (enRetard > 0) {
    chips.push({
      key: 'enRetard',
      label: 'En retard',
      value: formatCurrency(enRetard),
      href: '/facturation',
      cta: 'Relancer',
      tone: 'danger',
    });
  }
  if (aFacturer > 0) {
    chips.push({
      key: 'aFacturer',
      label: 'À facturer',
      value: formatCurrency(aFacturer),
      href: '/facturation',
      cta: 'Émettre',
      tone: 'info',
    });
  }
  chips.push({
    key: 'semaine',
    label: 'Ta semaine',
    value: `${weekHours}h / 35h`,
    href: '/temps',
    cta: 'Saisir',
    tone: weekHours >= 35 ? 'ok' : 'warn',
  });

  return (
    <div className="relative">
      {editMode && (
        <button
          type="button"
          onClick={() => onHide?.()}
          aria-label="Masquer les chips"
          className="bg-background border-border hover:bg-destructive hover:text-destructive-foreground absolute -top-2 -right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border text-xs"
        >
          ×
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="border-border/60 bg-card hover:border-foreground/20 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors"
          >
            <span className={cn('size-1.5 rounded-full', dotTone[c.tone])} />
            <span className="text-muted-foreground">{c.label}</span>
            <span className={cn('num font-bold', valueTone[c.tone])}>
              {c.value}
            </span>
            <span className="text-primary font-semibold">{c.cta} ›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
