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
  Bell,
  Users,
  Building2,
  Settings,
  ChevronLeft,
  LogOut,
  User,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { isAdmin, getRoleLabel } from '@/lib/utils/roles';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useBadgeCounts } from '@/hooks/use-badge-counts';

const mainNavItems = [
  { href: '/projets', label: 'Projets', icon: ClipboardList },
  { href: '/qualite', label: 'Qualité', icon: CheckCircle },
  { href: '/temps', label: 'Temps', icon: Clock },
  { href: '/production', label: 'Production', icon: TrendingUp },
  { href: '/facturation', label: 'Facturation', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const adminNavItems = [
  {
    href: '/admin/clients',
    label: 'Clients',
    icon: Building2,
    adminOnly: true,
  },
  {
    href: '/admin/utilisateurs',
    label: 'Utilisateurs',
    icon: Users,
    adminOnly: true,
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
  /** Mobile overlay mode */
  mobile?: boolean;
  /** Close the mobile sidebar */
  onClose?: () => void;
}

// Map nav hrefs → badge keys + colours
const badgeConfig: Record<
  string,
  {
    key:
      | 'facturesEnRetard'
      | 'tempsNonSaisi'
      | 'notifications'
      | 'tachesEnAttente';
    color: string;
  }
> = {
  '/facturation': { key: 'facturesEnRetard', color: 'bg-red-500' },
  '/qualite': { key: 'tachesEnAttente', color: 'bg-orange-500' },
  '/temps': { key: 'tempsNonSaisi', color: 'bg-orange-500' },
  '/notifications': { key: 'notifications', color: 'bg-blue-500' },
};

export function Sidebar({
  collapsed,
  onToggle,
  user,
  mobile,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const badgeCounts = useBadgeCounts();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside
      className={cn(
        'border-sidebar-border bg-sidebar flex flex-col border-r transition-all',
        mobile ? 'h-full w-full' : 'sticky top-0 h-screen',
        !mobile && (collapsed ? 'w-16' : 'w-[260px]'),
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'border-sidebar-border flex h-14 items-center border-b',
          collapsed && !mobile ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {collapsed && !mobile ? (
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
            <Link
              href="/projets"
              className="flex shrink-0 items-center"
              onClick={mobile ? onClose : undefined}
            >
              <Image
                src="/logo.svg"
                alt="Soluvia"
                width={140}
                height={28}
                priority
              />
            </Link>
            {mobile ? (
              <button
                onClick={onClose}
                aria-label="Fermer le menu"
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-1.5"
              >
                <X className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={onToggle}
                aria-label="Réduire la sidebar"
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {mainNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          const badge = badgeConfig[item.href];
          const count = badge ? badgeCounts[badge.key] : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={mobile ? onClose : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <span className="relative shrink-0">
                <Icon className="h-[18px] w-[18px]" />
                {collapsed && badge && count > 0 && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                      badge.color,
                    )}
                  >
                    {count}
                  </span>
                )}
              </span>
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  {badge && count > 0 && (
                    <span
                      className={cn(
                        'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white',
                        badge.color,
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}

        {isAdmin(user?.role) && (
          <>
            <Separator className="my-2" />

            {!collapsed && (
              <div className="text-muted-foreground px-3 py-1 text-[10px] font-semibold tracking-wider uppercase">
                Administration
              </div>
            )}
          </>
        )}

        {adminNavItems
          .filter((item) => !item.adminOnly || isAdmin(user?.role))
          .map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={mobile ? onClose : undefined}
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
            <Link
              href="/parametres-compte"
              title="Mon compte"
              className="text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-[13px] font-bold transition-opacity hover:opacity-80"
            >
              {user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : '?'}
            </Link>
            <ThemeToggle />
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
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link
                href="/parametres-compte"
                onClick={mobile ? onClose : undefined}
                className="text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-[13px] font-bold transition-opacity hover:opacity-80"
              >
                {user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : '?'}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href="/parametres-compte"
                  onClick={mobile ? onClose : undefined}
                  className="hover:text-foreground block truncate text-[13px] font-medium transition-colors"
                >
                  {user ? `${user.prenom} ${user.nom}` : 'Utilisateur'}
                </Link>
                <div className="text-muted-foreground text-[11px]">
                  {user ? getRoleLabel(user.role) : '—'}
                </div>
              </div>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/parametres-compte"
                onClick={mobile ? onClose : undefined}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors"
              >
                <User className="h-3 w-3" />
                Mon compte
              </Link>
              <span className="text-border">|</span>
              <button
                onClick={handleLogout}
                aria-label="Se déconnecter"
                className="text-muted-foreground hover:text-foreground text-[11px] transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
