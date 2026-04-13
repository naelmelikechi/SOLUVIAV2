'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Receipt,
  ClipboardCheck,
  BarChart3,
  Clock,
  Bell,
  Building2,
  Users,
  Settings,
  User,
  Plus,
} from 'lucide-react';
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import type { LucideIcon } from 'lucide-react';

interface CommandPaletteItem {
  label: string;
  href?: string;
  action?: string;
  section: 'Pages' | 'Actions';
  icon: LucideIcon;
}

const items: CommandPaletteItem[] = [
  // Pages
  {
    label: 'Tableau de bord',
    href: '/dashboard',
    section: 'Pages',
    icon: LayoutDashboard,
  },
  {
    label: 'Projets',
    href: '/projets',
    section: 'Pages',
    icon: FolderKanban,
  },
  {
    label: 'Facturation',
    href: '/facturation',
    section: 'Pages',
    icon: Receipt,
  },
  {
    label: 'Qualite',
    href: '/qualite',
    section: 'Pages',
    icon: ClipboardCheck,
  },
  {
    label: 'Production',
    href: '/production',
    section: 'Pages',
    icon: BarChart3,
  },
  { label: 'Temps', href: '/temps', section: 'Pages', icon: Clock },
  {
    label: 'Notifications',
    href: '/notifications',
    section: 'Pages',
    icon: Bell,
  },
  {
    label: 'Clients',
    href: '/admin/clients',
    section: 'Pages',
    icon: Building2,
  },
  {
    label: 'Utilisateurs',
    href: '/admin/utilisateurs',
    section: 'Pages',
    icon: Users,
  },
  {
    label: 'Parametres',
    href: '/admin/parametres',
    section: 'Pages',
    icon: Settings,
  },
  {
    label: 'Mon compte',
    href: '/parametres-compte',
    section: 'Pages',
    icon: User,
  },
  // Actions rapides
  {
    label: 'Nouveau client',
    action: 'create-client',
    section: 'Actions',
    icon: Plus,
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (item: CommandPaletteItem) => {
      setOpen(false);
      if (item.href) {
        router.push(item.href);
      } else if (item.action === 'create-client') {
        router.push('/admin/clients?action=nouveau');
      }
    },
    [router],
  );

  const pages = items.filter((i) => i.section === 'Pages');
  const actions = items.filter((i) => i.section === 'Actions');

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Palette de commandes"
      description="Rechercher une page ou une action"
      className="sm:max-w-lg"
    >
      <Command>
        <CommandInput placeholder="Rechercher..." />
        <CommandList>
          <CommandEmpty>Aucun resultat.</CommandEmpty>
          <CommandGroup heading="Pages">
            {pages.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.label}
                  onSelect={() => handleSelect(item)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions rapides">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.label}
                  onSelect={() => handleSelect(item)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
