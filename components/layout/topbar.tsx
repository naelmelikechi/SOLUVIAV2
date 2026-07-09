'use client';

import Link from 'next/link';
import { Bell, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BadgeCounts } from '@/hooks/use-badge-counts';

// Le fil d'Ariane a quitté la topbar : chaque page profonde rend ses propres
// crumbs via <PageHeader breadcrumbs> (components/shared/breadcrumbs.tsx),
// avec les vrais noms d'entités. La topbar garde hamburger/recherche/cloche.
export function Topbar({
  onHamburgerClick,
  badgeCounts = {
    facturesEnRetard: 0,
    tempsNonSaisi: 0,
    notifications: 0,
    intercontrat: 0,
    bugsNouveaux: 0,
    contratsAFacturer: 0,
  },
}: { onHamburgerClick?: () => void; badgeCounts?: BadgeCounts } = {}) {
  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      }),
    );
  };

  return (
    <header className="border-border bg-card flex h-14 items-center justify-between border-b px-4 md:px-6">
      {/* Mobile/tablet hamburger (visible jusqu'a lg=1024px) */}
      <div className="flex items-center">
        {onHamburgerClick && (
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 lg:hidden"
            onClick={onHamburgerClick}
            aria-label="Ouvrir le menu"
          >
            <Menu className="size-5" />
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openCommandPalette}
          className="border-input bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Rechercher…</span>
          <kbd className="bg-background pointer-events-none ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
            &#8984;K
          </kbd>
        </button>
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring relative inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bell className="size-[18px]" />
          {badgeCounts.notifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
              {badgeCounts.notifications}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
