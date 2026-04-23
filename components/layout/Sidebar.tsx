'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getAvatarUrl } from '@/components/shared/user-avatar';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  CheckCircle,
  Clock,
  TrendingUp,
  FileText,
  BarChart3,
  Users,
  UsersRound,
  Building2,
  Settings,
  ChevronLeft,
  LogOut,
  User,
  X,
  Target,
  Lightbulb,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { isAdmin, canAccessPipeline, getRoleLabel } from '@/lib/utils/roles';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const mainNavItems = [
  { href: '/projets', label: 'Projets', icon: ClipboardList },
  { href: '/qualite', label: 'Qualité', icon: CheckCircle },
  { href: '/temps', label: 'Temps', icon: Clock },
  { href: '/production', label: 'Production', icon: TrendingUp },
  { href: '/facturation', label: 'Facturation', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/equipe', label: 'Équipe', icon: UsersRound },
  { href: '/idees', label: 'Idées', icon: Lightbulb },
];

const commercialNavItems = [
  { href: '/commercial/pipeline', label: 'Pipeline', icon: Target },
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
  user?: {
    nom: string;
    prenom: string;
    role: string;
    email: string;
    avatar_mode?: 'daily' | 'random' | 'frozen' | null;
    avatar_seed: string | null;
    avatar_regen_date?: string | null;
    pipeline_access?: boolean;
  } | null;
  /** Mobile overlay mode */
  mobile?: boolean;
  /** Close the mobile sidebar */
  onClose?: () => void;
  /** Badge counts passed from layout (single Realtime connection) */
  badgeCounts?: BadgeCounts;
}

// Map nav hrefs → badge keys + colours
const badgeConfig: Record<
  string,
  {
    key: 'facturesEnRetard' | 'tempsNonSaisi' | 'tachesEnAttente';
    color: string;
  }
> = {
  '/facturation': { key: 'facturesEnRetard', color: 'bg-red-500' },
  '/qualite': { key: 'tachesEnAttente', color: 'bg-orange-500' },
  '/temps': { key: 'tempsNonSaisi', color: 'bg-orange-500' },
};

const INITIAL_BADGE_COUNTS: BadgeCounts = {
  facturesEnRetard: 0,
  tempsNonSaisi: 0,
  notifications: 0,
  tachesEnAttente: 0,
};

export function Sidebar({
  collapsed,
  onToggle,
  user,
  mobile,
  onClose,
  badgeCounts = INITIAL_BADGE_COUNTS,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);

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
              className="dark:brightness-0 dark:invert"
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
                className="dark:brightness-0 dark:invert"
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
                  ? 'bg-primary/10 text-primary border-primary border-l-3 font-semibold'
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

        {canAccessPipeline(user?.role, user?.pipeline_access) && (
          <>
            <Separator className="my-2" />

            {!collapsed && (
              <div className="text-muted-foreground px-3 py-1 text-[10px] font-semibold tracking-wider uppercase">
                Commercial
              </div>
            )}

            {commercialNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
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
                      ? 'bg-primary/10 text-primary border-primary border-l-3 font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}

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
                    ? 'bg-primary/10 text-primary border-primary border-l-3 font-semibold'
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
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition-opacity hover:opacity-80"
            >
              {user ? (
                <Image
                  src={getAvatarUrl(
                    user.email,
                    user.avatar_seed,
                    undefined,
                    user.avatar_mode,
                    user.avatar_regen_date,
                  )}
                  alt={`${user.prenom} ${user.nom}`}
                  width={32}
                  height={32}
                  unoptimized
                  className="h-full w-full"
                />
              ) : (
                <span className="text-primary flex h-full w-full items-center justify-center bg-[var(--primary-bg-strong)] text-[13px] font-bold">
                  ?
                </span>
              )}
            </Link>
            <ThemeToggle />
            <button
              onClick={() => setLogoutOpen(true)}
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
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition-opacity hover:opacity-80"
              >
                {user ? (
                  <Image
                    src={getAvatarUrl(
                      user.email,
                      user.avatar_seed,
                      undefined,
                      user.avatar_mode,
                      user.avatar_regen_date,
                    )}
                    alt={`${user.prenom} ${user.nom}`}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-full w-full"
                  />
                ) : (
                  <span className="text-primary flex h-full w-full items-center justify-center bg-[var(--primary-bg-strong)] text-[13px] font-bold">
                    ?
                  </span>
                )}
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
                  {user ? getRoleLabel(user.role) : '-'}
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
                onClick={() => setLogoutOpen(true)}
                aria-label="Se déconnecter"
                className="text-muted-foreground hover:text-foreground text-[11px] transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Déconnexion"
        description="Êtes-vous sûr de vouloir vous déconnecter ?"
        confirmText="Se déconnecter"
        onConfirm={handleLogout}
      />
    </aside>
  );
}
