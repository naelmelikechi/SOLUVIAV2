'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/crm/utils';
import { BrandLogo } from '@/components/crm/layout/brand-logo';
import { navItems } from '@/components/crm/layout/nav';

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = navItems(isAdmin);
  return (
    <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r p-3 md:block">
      <div className="mb-6 px-2 pt-1">
        <BrandLogo height={24} themed />
      </div>
      <nav className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {active && (
                <span className="bg-primary absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
