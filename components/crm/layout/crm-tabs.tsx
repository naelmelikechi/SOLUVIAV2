'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from '@/components/crm/layout/nav';
import { cn } from '@/lib/utils';

/**
 * Sous-navigation du CRM, rendue dans le shell principal (le CRM n'a plus
 * son propre shell) : une barre d'onglets par lien, même pattern que
 * /pilotage. La cloche de notifications CRM est passée en slot à droite.
 */
export function CrmTabs({
  isAdmin,
  right,
}: {
  isAdmin: boolean;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = navItems(isAdmin);

  return (
    <div className="border-border mb-6 flex items-center justify-between gap-2 border-b">
      <nav aria-label="Sections du CRM" className="flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border-transparent',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {right && <div className="shrink-0 pb-1">{right}</div>}
    </div>
  );
}
