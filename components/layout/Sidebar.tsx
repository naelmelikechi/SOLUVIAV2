'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const mainNavItems = [
  { href: '/projets', label: 'Projets', icon: ClipboardList },
  { href: '/qualite', label: 'Qualite', icon: CheckCircle },
  { href: '/temps', label: 'Temps', icon: Clock },
  { href: '/production', label: 'Production', icon: TrendingUp },
  { href: '/facturation', label: 'Facturation', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

const adminNavItems = [
  { href: '/admin/clients', label: 'Clients', icon: Building2 },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  { href: '/admin/parametres', label: 'Parametres', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'border-sidebar-border bg-sidebar row-span-full flex flex-col border-r transition-all',
        collapsed ? 'w-16' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className="border-sidebar-border flex h-14 items-center justify-between border-b px-4">
        {!collapsed && (
          <span className="text-primary text-base font-bold tracking-[3px]">
            SOLUVIA
          </span>
        )}
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-1.5"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
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

        {adminNavItems.map((item) => {
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
        <div className="flex items-center gap-3">
          <div className="text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-bg-strong)] text-[13px] font-bold">
            ?
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">
                Utilisateur
              </div>
              <div className="text-muted-foreground text-[11px]">—</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
