'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface PilotageTab {
  /** Valeur du searchParam ?tab= ('' = onglet par défaut, sans param). */
  value: string;
  label: string;
}

// Barre d'onglets par lien (searchParam ?tab=) : la page reste un Server
// Component et ne fetch que les données de l'onglet actif. Les autres params
// (periode, p, t) sont préservés à la navigation.
export function PilotageTabs(props: { tabs: PilotageTab[]; current: string }) {
  return (
    <Suspense fallback={null}>
      <PilotageTabsInner {...props} />
    </Suspense>
  );
}

function PilotageTabsInner({
  tabs,
  current,
}: {
  tabs: PilotageTab[];
  current: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (tabs.length < 2) return null;

  const hrefFor = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('tab', value);
    else params.delete('tab');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <nav
      aria-label="Sections du pilotage"
      className="border-border flex gap-1 border-b"
    >
      {tabs.map((tab) => {
        const active = tab.value === current;
        return (
          <Link
            key={tab.value || 'defaut'}
            href={hrefFor(tab.value)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border-transparent',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
