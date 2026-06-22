import type { LucideIcon } from 'lucide-react';
import {
  Home,
  BarChart3,
  LineChart,
  ClipboardList,
  Sparkles,
  Clock,
  ShieldCheck,
  TrendingUp,
  Users,
  UsersRound,
  FileText,
  ScrollText,
  Send,
  Lightbulb,
  Building2,
  Settings,
  Bug,
  Landmark,
  Activity,
} from 'lucide-react';
import { isAdmin, canAccessPipeline, isReferentCdp } from '@/lib/utils/roles';

// ---------------------------------------------------------------------------
// Source UNIQUE de la navigation, partagée par la sidebar ET la command-palette
// (⌘K). Une seule définition => mêmes libellés, mêmes icônes, même gating de
// rôle, et toute nouvelle route apparaît automatiquement dans les deux surfaces.
// ---------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  requiresIndicateursAccess?: boolean;
  requiresPipelineAccess?: boolean;
  requiresReferentCdp?: boolean;
  requiresCdpOrAdmin?: boolean;
  /** Active state : match exact du pathname (sinon startsWith). */
  exactMatch?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface NavGateUser {
  role?: string | null;
  pipeline_access?: boolean | null;
  referent_cdp?: boolean | null;
}

export const navSections: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/accueil', label: 'Accueil', icon: Home },
      { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
      {
        href: '/indicateurs',
        label: 'Indicateurs',
        icon: LineChart,
        requiresIndicateursAccess: true,
      },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { href: '/projets', label: 'Projets', icon: ClipboardList },
      { href: '/projets/internes', label: 'Projets internes', icon: Sparkles },
      { href: '/temps', label: 'Temps', icon: Clock },
      { href: '/qualiopi', label: 'Qualité', icon: ShieldCheck },
      { href: '/production', label: 'Production', icon: TrendingUp },
    ],
  },
  {
    title: 'Commercial',
    items: [
      {
        href: '/commercial/prospects',
        label: 'Prospects',
        icon: Users,
        requiresPipelineAccess: true,
      },
      {
        href: '/commercial/modeles',
        label: 'Modèles',
        icon: ClipboardList,
        requiresPipelineAccess: true,
      },
      {
        href: '/commercial/cdp',
        label: 'Plan de charge CDP',
        icon: BarChart3,
        requiresReferentCdp: true,
      },
      {
        href: '/commercial/kpis',
        label: 'KPIs',
        icon: LineChart,
        requiresPipelineAccess: true,
      },
      {
        href: '/commercial/linkedin',
        label: 'LinkedIn',
        icon: Activity,
        requiresPipelineAccess: true,
      },
    ],
  },
  {
    title: 'Facturation',
    items: [
      { href: '/devis', label: 'Devis', icon: ScrollText, adminOnly: true },
      { href: '/facturation', label: 'Facturation', icon: FileText },
      {
        href: '/a-facturer',
        label: 'À facturer',
        icon: Send,
        requiresCdpOrAdmin: true,
      },
    ],
  },
  {
    title: 'Équipe',
    items: [
      { href: '/equipe', label: 'Équipe', icon: UsersRound },
      { href: '/idees', label: 'Idées', icon: Lightbulb },
    ],
  },
];

export const adminNavItems: NavItem[] = [
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
    href: '/admin/intercontrat',
    label: 'Intercontrat',
    icon: UsersRound,
    adminOnly: true,
  },
  { href: '/admin/bugs', label: 'Bugs', icon: Bug, adminOnly: true },
  { href: '/admin/syncs', label: 'Syncs', icon: Activity, adminOnly: true },
  {
    href: '/admin/parametres',
    label: 'Paramètres',
    icon: Settings,
    adminOnly: true,
    exactMatch: true,
  },
  {
    href: '/admin/parametres/opcos',
    label: 'Référentiel OPCO',
    icon: Landmark,
    adminOnly: true,
  },
];

/** Indicateurs : admin, CDP, ou tout porteur d'accès pipeline. */
export function canAccessIndicateurs(
  role: string | null | undefined,
  pipelineAccess: boolean | null | undefined,
): boolean {
  return (
    isAdmin(role) || role === 'cdp' || canAccessPipeline(role, pipelineAccess)
  );
}

/** Vrai si l'utilisateur peut accéder à cet item (gating unique nav + palette). */
export function canAccessNavItem(item: NavItem, user: NavGateUser): boolean {
  if (item.adminOnly && !isAdmin(user.role)) return false;
  if (
    item.requiresIndicateursAccess &&
    !canAccessIndicateurs(user.role, user.pipeline_access)
  )
    return false;
  if (
    item.requiresPipelineAccess &&
    !canAccessPipeline(user.role, user.pipeline_access)
  )
    return false;
  if (item.requiresReferentCdp && !isReferentCdp(user.role, user.referent_cdp))
    return false;
  if (item.requiresCdpOrAdmin && !isAdmin(user.role) && user.role !== 'cdp')
    return false;
  return true;
}

/** Tous les items de nav à plat (sections + admin) — pour la command-palette. */
export const allNavItems: NavItem[] = [
  ...navSections.flatMap((s) => s.items),
  ...adminNavItems,
];
