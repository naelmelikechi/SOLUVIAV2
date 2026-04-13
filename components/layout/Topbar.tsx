'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell, ChevronRight, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

const routeLabels: Record<string, string> = {
  projets: 'Projets',
  qualite: 'Qualité',
  temps: 'Temps',
  production: 'Production',
  facturation: 'Facturation',
  dashboard: 'Dashboard',
  admin: 'Administration',
  clients: 'Clients',
  utilisateurs: 'Utilisateurs',
  parametres: 'Paramètres',
  'parametres-compte': 'Mon compte',
  notifications: 'Notifications',
};

export function Topbar({
  onHamburgerClick,
}: { onHamburgerClick?: () => void } = {}) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = routeLabels[segment] || segment;
    return { href, label };
  });

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
      {/* Mobile hamburger */}
      {onHamburgerClick && (
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 md:hidden"
          onClick={onHamburgerClick}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}
      {/* Breadcrumbs */}
      <nav
        aria-label="Fil d'Ariane"
        className="flex items-center gap-1.5 text-sm"
      >
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={openCommandPalette}
          className="border-input bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Rechercher...</span>
          <kbd className="bg-background pointer-events-none ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
            &#8984;K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </header>
  );
}
