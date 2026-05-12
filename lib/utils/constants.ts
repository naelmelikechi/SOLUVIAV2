import type { BadgeColor } from '@/components/shared/status-badge';

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

// Idées (boîte à idées)
export const STATUT_IDEE_ORDER = [
  'proposee',
  'validee',
  'implementee',
  'rejetee',
] as const;

export type StatutIdee = (typeof STATUT_IDEE_ORDER)[number];

export const STATUT_IDEE_LABELS: Record<StatutIdee, string> = {
  proposee: 'Proposée',
  validee: 'Validée',
  implementee: 'Implémentée',
  rejetee: 'Rejetée',
};

export const STATUT_IDEE_COLORS: Record<StatutIdee, BadgeColor> = {
  proposee: 'gray',
  validee: 'blue',
  implementee: 'green',
  rejetee: 'red',
};

export type CibleIdee = 'eduvia' | 'soluvia' | 'workflow' | 'autre';

export const CIBLE_IDEE_LABELS: Record<CibleIdee, string> = {
  eduvia: 'Eduvia',
  soluvia: 'Soluvia',
  workflow: 'Workflow',
  autre: 'Autre',
};

export const CIBLE_IDEE_COLORS: Record<CibleIdee, BadgeColor> = {
  eduvia: 'purple',
  soluvia: 'green',
  workflow: 'blue',
  autre: 'gray',
};

// RDV (formateurs et commerciaux)
export type StatutRdv = 'prevu' | 'realise' | 'annule';

export const STATUT_RDV_LABELS: Record<StatutRdv, string> = {
  prevu: 'Prévu',
  realise: 'Réalisé',
  annule: 'Annulé',
};

export const STATUT_RDV_COLORS: Record<StatutRdv, BadgeColor> = {
  prevu: 'blue',
  realise: 'green',
  annule: 'gray',
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
