'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell, ChevronRight } from 'lucide-react';
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
};

export function Topbar() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = routeLabels[segment] || segment;
    return { href, label };
  });

  return (
    <header className="border-border bg-card flex items-center justify-between border-b px-6">
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
