'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AccueilWorklistItem, WorklistColor } from '@/lib/queries/accueil';

const DOT_COLOR: Record<WorklistColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
};

/**
 * Grille des compteurs d'action de pilotage (worklist). Partagée par l'accueil
 * CDP et la supervision admin pour une présentation cohérente.
 */
export function WorklistGrid({ items }: { items: AccueilWorklistItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="block">
          <Card className="hover:bg-muted/50 flex items-center justify-between p-4 transition-colors">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  DOT_COLOR[item.color],
                )}
              />
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">
                    {item.count}
                  </span>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {item.description}
                </p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
