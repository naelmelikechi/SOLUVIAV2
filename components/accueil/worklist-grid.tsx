'use client';

import Link from 'next/link';
import {
  Bell,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock,
  ScrollText,
  Send,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AccueilWorklistItem, WorklistColor } from '@/lib/queries/accueil';

// Une action = une rangée d'inbox : icône teintée, compteur fort, libellé,
// description, chevron. La liste unique remplace l'ancienne grille de cartes
// (beaucoup de vide, carte orpheline, grammaire identique aux stats).
const TONE: Record<WorklistColor, { chip: string; count: string }> = {
  red: {
    chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
    count: 'text-red-600 dark:text-red-400',
  },
  orange: {
    chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    count: 'text-orange-600 dark:text-orange-400',
  },
  blue: {
    chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    count: 'text-blue-600 dark:text-blue-400',
  },
};

const ICONS: Record<string, LucideIcon> = {
  'a-facturer': Send,
  temps: Clock,
  progression: TrendingDown,
  'devis-relance': ScrollText,
  rdv: CalendarClock,
  notifications: Bell,
};

/**
 * Liste des actions de pilotage (worklist). Partagée par l'accueil CDP et la
 * supervision admin pour une présentation cohérente.
 */
export function WorklistGrid({ items }: { items: AccueilWorklistItem[] }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="border-border flex items-baseline justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">À traiter</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {total} élément{total > 1 ? 's' : ''}
        </span>
      </div>
      <ul className="divide-border divide-y">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? CircleAlert;
          const tone = TONE[item.color];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    tone.chip,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight font-medium">
                    <span className={cn('font-bold tabular-nums', tone.count)}>
                      {item.count}
                    </span>{' '}
                    {item.title}
                  </p>
                  <p className="text-muted-foreground truncate text-xs leading-tight">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
