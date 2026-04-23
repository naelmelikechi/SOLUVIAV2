import type { LucideIcon } from 'lucide-react';
import type { BadgeColor } from '@/components/shared/status-badge';
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
} from 'lucide-react';

// Time tracking
export const MAX_HEURES_JOUR = 7;
export const MAX_HEURES_SEMAINE = 35;
export const DEBOUNCE_MS = 2000;

// Quality
export const FAMILLES_QUALITE_COUNT = 10;
export const LIVRABLES_TOTAL = 109;

// Invoicing
export const FENETRE_FACTURATION_DEBUT = 25;
export const FENETRE_FACTURATION_FIN = 3;
export const DELAI_ECHEANCE_JOURS = 30;
export const TAUX_TVA_DEFAUT = 20;

// Project statuses
export const STATUT_PROJET_LABELS: Record<string, string> = {
  actif: 'Actif',
  en_pause: 'En pause',
  termine: 'Terminé',
  archive: 'Archivé',
};

export const STATUT_PROJET_COLORS: Record<string, BadgeColor> = {
  actif: 'green',
  en_pause: 'orange',
  termine: 'blue',
  archive: 'gray',
};

// Prospect stages (pipeline commercial)
export const STAGE_PROSPECT_ORDER = [
  'non_contacte',
  'r1',
  'r2',
  'signe',
] as const;

export type StageProspect = (typeof STAGE_PROSPECT_ORDER)[number];

export const STAGE_PROSPECT_LABELS: Record<StageProspect, string> = {
  non_contacte: 'Non contacté',
  r1: 'R1 validé',
  r2: 'R2 validé',
  signe: 'Signé',
};

export const STAGE_PROSPECT_COLORS: Record<StageProspect, BadgeColor> = {
  non_contacte: 'gray',
  r1: 'blue',
  r2: 'orange',
  signe: 'green',
};

export type TypeProspect = 'cfa' | 'entreprise';

export const TYPE_PROSPECT_LABELS: Record<TypeProspect, string> = {
  cfa: 'CFA',
  entreprise: 'Entreprise',
};

// Invoice statuses
export const STATUT_FACTURE_LABELS: Record<string, string> = {
  a_emettre: 'À émettre',
  emise: 'Émise',
  payee: 'Payée',
  en_retard: 'En retard',
  avoir: 'Avoir',
};

export const STATUT_FACTURE_COLORS: Record<string, BadgeColor> = {
  a_emettre: 'gray',
  emise: 'blue',
  payee: 'green',
  en_retard: 'red',
  avoir: 'purple',
};

// Time axes
export const AXES_TEMPS = [
  { code: 'accompagnement', label: 'Accompagnement', color: '#16a34a' },
  { code: 'pedagogie', label: 'Pédagogie', color: '#059669' },
  { code: 'administratif', label: 'Administratif', color: '#0d9488' },
  { code: 'qualite', label: 'Qualité', color: '#0891b2' },
  { code: 'commercial', label: 'Commercial', color: '#6366f1' },
] as const;

// Navigation
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/projets', label: 'Projets', icon: ClipboardList },
  { href: '/qualite', label: 'Qualité', icon: CheckCircle },
  { href: '/temps', label: 'Temps', icon: Clock },
  { href: '/production', label: 'Production', icon: TrendingUp },
  { href: '/facturation', label: 'Facturation', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/clients', label: 'Clients', icon: Building2 },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  {
    href: '/admin/parametres',
    label: 'Paramètres',
    icon: Settings,
    adminOnly: true,
  },
];

// Absence project refs
export const ABSENCE_PROJECTS = {
  CONGES: '9999-CON-ABS',
  MALADIE: '9998-MAL-ABS',
  FERIES: '9997-FER-ABS',
} as const;
