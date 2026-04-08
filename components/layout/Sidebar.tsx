'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  CheckCircle,
  Clock,
  TrendingUp,
  FileText,
  BarChart3,
  Users,
  Building2,
  Settings,
  ChevronLeft,
  LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const mainNavItems = [
  { href: '/projets', label: 'Projets', icon: ClipboardList },
  { href: '/qualite', label: 'Qualité', icon: CheckCircle },
  { href: '/temps', label: 'Temps', icon: Clock },
  { href: '/production', label: 'Production', icon: TrendingUp },
  { href: '/facturation', label: 'Facturation', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

const adminNavItems = [
  {
    href: '/admin/clients',
    label: 'Clients',
    icon: Building2,
    adminOnly: false,
  },
  {
    href: '/admin/utilisateurs',
    label: 'Utilisateurs',
    icon: Users,
    adminOnly: false,
  },
  {
    href: '/admin/parametres',
    label: 'Paramètres',
    icon: Settings,
    adminOnly: true,
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: { nom: string; prenom: string; role: string } | null;
}

export function Sidebar({ collapsed, onToggle, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside
      className={cn(
        'border-sidebar-border bg-sidebar row-span-full flex flex-col border-r transition-all',
        collapsed ? 'w-16' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'border-sidebar-border flex h-14 items-center border-b',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            aria-label="Ouvrir la sidebar"
            className="transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo-icon.svg"
              alt="Soluvia"
              width={26}
              height={32}
              priority
            />
          </button>
        ) : (
          <>
            <Link href="/projets" className="flex shrink-0 items-center">
              <Image
                src="/logo.svg"
                alt="Soluvia"
                width={140}
                height={28}
                priority
              />
            </Link>
            <button
              onClick={onToggle}
              aria-label="Réduire la sidebar"
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {mainNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        <Separator className="my-2" />

        {!collapsed && (
          <div className="text-muted-foreground px-3 py-1 text-[10px] font-semibold tracking-wider uppercase">
            Administration
          </div>
        )}

        {adminNavItems
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  collapsed ? 'justify-center' : 'pl-11',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-muted-foreground hover:text-sidebar-foreground',
                )}
              >
                {collapsed && <Icon className="h-[18px] w-[18px] shrink-0" />}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
      </nav>

      {/* Profile */}
      <div className="border-sidebar-border border-t px-3 py-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-[13px] font-bold">
              {user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : '?'}
            </div>
            <button
              onClick={handleLogout}
              aria-label="Se déconnecter"
              title="Déconnexion"
              className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-[13px] font-bold">
              {user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">
                {user ? `${user.prenom} ${user.nom}` : 'Utilisateur'}
              </div>
              <div className="text-muted-foreground text-[11px]">
                {user ? (user.role === 'admin' ? 'Admin' : 'CDP') : '—'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="text-muted-foreground hover:text-foreground shrink-0 text-[11px] transition-colors"
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
