'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  /** id de l'élément ancré dans la page (sans #). */
  id: string;
  label: string;
}

/**
 * Sous-navigation sticky avec scroll-spy : des pills ancrées vers les zones
 * d'une page longue. Pas de tabs (tout le contenu reste scannable au scroll),
 * juste de l'orientation.
 */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // La zone la plus haute visible gagne (lecture naturelle du scroll).
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(first.target.id);
      },
      // Bande de détection sous le header sticky : une zone est "active"
      // quand son haut entre dans le tiers supérieur du viewport.
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Sections de la page"
      className="bg-background/95 sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 py-2 backdrop-blur"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={active === item.id ? 'true' : undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
            active === item.id
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
