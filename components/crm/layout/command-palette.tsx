'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCircle, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/crm/ui/command';
import { NAV, type NavItem } from '@/components/crm/layout/nav';

/**
 * Palette de commandes globale (⌘K / Ctrl+K) : navigation rapide entre les pages.
 * Affordance dans la topbar : un faux champ de recherche qui ouvre la palette.
 */
export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const items = React.useMemo<NavItem[]>(
    () => [
      ...NAV,
      { href: '/compte', label: 'Mon compte', icon: UserCircle },
      ...(isAdmin
        ? [{ href: '/utilisateurs', label: 'Utilisateurs', icon: ShieldCheck }]
        : []),
    ],
    [isAdmin],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-input bg-background text-muted-foreground hover:bg-accent/60 flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Aller à une page…</span>
        <kbd className="border-border bg-muted text-muted-foreground ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Navigation"
        description="Aller à une page"
      >
        <CommandInput placeholder="Aller à…" />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {items.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={label} onSelect={() => go(href)}>
                <Icon className="text-muted-foreground h-4 w-4" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
