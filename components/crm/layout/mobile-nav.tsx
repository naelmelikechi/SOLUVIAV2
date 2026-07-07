'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ArrowLeft } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/crm/ui/sheet';
import { Button } from '@/components/crm/ui/button';
import { BrandLogo } from '@/components/crm/layout/brand-logo';
import { navItems } from '@/components/crm/layout/nav';
import { cn } from '@/lib/crm/utils';

/** Navigation mobile : bouton hamburger + drawer latéral. Caché en ≥ md (sidebar). */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navItems(isAdmin);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Ouvrir le menu"
          />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-3">
        <SheetHeader className="px-2">
          <SheetTitle>
            <BrandLogo height={24} themed />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigation principale
          </SheetDescription>
        </SheetHeader>
        <nav className="mt-2 space-y-0.5">
          <Link
            href="/accueil"
            onClick={() => setOpen(false)}
            className={cn(
              'mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm',
              'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <ArrowLeft className="h-4 w-4" /> Retour à Soluvia
          </Link>
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
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
      </SheetContent>
    </Sheet>
  );
}
