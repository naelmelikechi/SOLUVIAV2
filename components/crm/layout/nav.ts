import {
  LayoutDashboard,
  KanbanSquare,
  BellRing,
  CalendarDays,
  Mail,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Source unique de la navigation (desktop sidebar + drawer mobile). */
export const NAV: NavItem[] = [
  { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/crm/relances', label: 'Relances', icon: BellRing },
  { href: '/crm/rdv', label: 'RDV', icon: CalendarDays },
];

export function navItems(isAdmin: boolean): NavItem[] {
  return isAdmin
    ? [...NAV, { href: '/crm/recap', label: 'Récap', icon: Mail }]
    : NAV;
}
