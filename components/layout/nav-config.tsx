import type { LucideIcon } from 'lucide-react';
import {
  Home,
  BarChart3,
  LineChart,
  ClipboardList,
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
  Activity,
  KanbanSquare,
  ListTodo,
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
  /**
   * Termes de recherche additionnels pour la command-palette (⌘K).
   * Permet de retrouver un item sous ses anciens noms ou ceux de pages
   * absorbées (ex. "dashboard" => Pilotage).
   */
  keywords?: string[];
}

export interface NavSection {
  /** Titre affiché en entête de section ('' = section de tête sans titre). */
  title: string;
  items: NavItem[];
  /** Section visible uniquement pour les admins (en plus du gating par item). */
  adminOnly?: boolean;
  /** Section repliable dans la sidebar (repliée par défaut). */
  collapsible?: boolean;
}

export interface NavGateUser {
  role?: string | null;
  pipeline_access?: boolean | null;
  referent_cdp?: boolean | null;
}

export const navSections: NavSection[] = [
  {
    title: '',
    items: [
      { href: '/accueil', label: 'Accueil', icon: Home },
      {
        href: '/taches',
        label: 'Tâches',
        icon: ListTodo,
        keywords: ['plane', 'todo', 'issues'],
      },
      {
        href: '/pilotage',
        label: 'Pilotage',
        icon: LineChart,
        keywords: ['dashboard', 'indicateurs', 'kpi', 'statistiques'],
      },
    ],
  },
  {
    title: 'Opérations',
    items: [
      {
        href: '/projets',
        label: 'Projets',
        icon: ClipboardList,
        keywords: ['internes'],
      },
      { href: '/temps', label: 'Temps', icon: Clock },
      { href: '/qualiopi', label: 'Qualité', icon: ShieldCheck },
      {
        href: '/a-facturer',
        label: 'À facturer (Eduvia)',
        icon: Send,
        requiresCdpOrAdmin: true,
      },
      { href: '/production', label: 'Production', icon: TrendingUp },
    ],
  },
  {
    title: 'Commercial',
    items: [
      {
        href: '/crm/dashboard',
        label: 'CRM',
        icon: KanbanSquare,
        requiresPipelineAccess: true,
        keywords: ['pipeline', 'prospects', 'opportunites'],
      },
      {
        href: '/commercial/passations',
        label: 'Passations',
        icon: FileText,
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
    ],
  },
  {
    title: 'Facturation',
    items: [
      { href: '/devis', label: 'Devis', icon: ScrollText, adminOnly: true },
      {
        href: '/facturation',
        label: 'Factures',
        icon: FileText,
        adminOnly: true,
        keywords: ['facturation'],
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
  {
    title: 'Administration',
    adminOnly: true,
    collapsible: true,
    items: [
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
        keywords: ['opco', 'referentiel', 'societes emettrices'],
      },
    ],
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

/** Match label OU keywords (command-palette). */
export function matchesNavItem(
  item: NavItem,
  matches: (haystack: string) => boolean,
): boolean {
  if (matches(item.label)) return true;
  return item.keywords?.some((k) => matches(k)) ?? false;
}

/** Tous les items de nav à plat — pour la command-palette. */
export const allNavItems: NavItem[] = navSections.flatMap((s) => s.items);
