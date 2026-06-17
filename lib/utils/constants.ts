import type { BadgeColor } from '@/components/shared/status-badge';

// Time tracking
export const MAX_HEURES_JOUR = 7;
export const DEBOUNCE_MS = 2000;

// Invoicing
export const FENETRE_FACTURATION_DEBUT = 25;
export const FENETRE_FACTURATION_FIN = 3;

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
  'a_qualifier',
  'presente',
  'cadre',
  'audite',
  'signe',
  'perdu',
] as const;

export type StageProspect = (typeof STAGE_PROSPECT_ORDER)[number];

export const STAGE_PROSPECT_LABELS: Record<StageProspect, string> = {
  a_qualifier: 'À qualifier',
  presente: 'Présenté',
  cadre: 'Cadré',
  audite: 'Audité',
  signe: 'Signé',
  perdu: 'Perdu',
};

export const STAGE_PROSPECT_COLORS: Record<StageProspect, BadgeColor> = {
  a_qualifier: 'gray',
  presente: 'blue',
  cadre: 'orange',
  audite: 'purple',
  signe: 'green',
  perdu: 'red',
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
export type StatutRdv = 'prevu' | 'realise' | 'annule' | 'reporte';

export const STATUT_RDV_LABELS: Record<StatutRdv, string> = {
  prevu: 'Planifié',
  realise: 'Tenu',
  annule: 'Annulé',
  reporte: 'Reporté',
};

export const STATUT_RDV_COLORS: Record<StatutRdv, BadgeColor> = {
  prevu: 'blue',
  realise: 'green',
  annule: 'gray',
  reporte: 'orange',
};

// Types de RDV commerciaux (tunnel 4 RDV)
export type TypeRdv =
  | 'presentation'
  | 'cadrage'
  | 'audit_tunnel_a'
  | 'audit_tunnel_b'
  | 'signature'
  | 'autre';

export const TYPE_RDV_LABELS: Record<TypeRdv, string> = {
  presentation: 'Présentation',
  cadrage: 'Cadrage',
  audit_tunnel_a: 'Audit Tunnel A — Entreprise',
  audit_tunnel_b: 'Audit Tunnel B — CFA existant',
  signature: 'Signature',
  autre: 'Autre',
};

export type FormatRdv =
  | 'presentiel'
  | 'visio_meet'
  | 'visio_zoom'
  | 'visio_teams'
  | 'telephone';

export const FORMAT_RDV_LABELS: Record<FormatRdv, string> = {
  presentiel: 'Présentiel',
  visio_meet: 'Visio Meet',
  visio_zoom: 'Visio Zoom',
  visio_teams: 'Visio Teams',
  telephone: 'Téléphone',
};

// Canal d'origine d'un prospect
export type CanalOrigine =
  | 'reseau_developpeur'
  | 'reseau_direction'
  | 'linkedin_auto'
  | 'salon'
  | 'apporteur'
  | 'autre';

export const CANAL_ORIGINE_LABELS: Record<CanalOrigine, string> = {
  reseau_developpeur: 'Réseau Développeur',
  reseau_direction: 'Réseau Direction',
  linkedin_auto: 'LinkedIn auto',
  salon: 'Salon',
  apporteur: 'Apporteur',
  autre: 'Autre',
};

// Rôle d'un interlocuteur dans la décision
export type RoleDecisionContact =
  | 'signataire'
  | 'sponsor'
  | 'operationnel'
  | 'soutien';

export const ROLE_DECISION_LABELS: Record<RoleDecisionContact, string> = {
  signataire: 'Signataire',
  sponsor: 'Sponsor',
  operationnel: 'Opérationnel',
  soutien: 'Soutien',
};

// Santé prospect : calculée sur le délai depuis la dernière action (Feature 1 §5)
export type SanteProspect = 'vert' | 'orange' | 'rouge';

export const SANTE_PROSPECT_SEUIL_VERT_JOURS = 7;
export const SANTE_PROSPECT_SEUIL_ORANGE_JOURS = 14;

export const SANTE_PROSPECT_LABELS: Record<SanteProspect, string> = {
  vert: 'À jour',
  orange: 'À relancer',
  rouge: 'En retard',
};

export const SANTE_PROSPECT_COLORS: Record<SanteProspect, BadgeColor> = {
  vert: 'green',
  orange: 'orange',
  rouge: 'red',
};

// Plancher tarifaire absolu (NPEC) : sous ce seuil, escalade Direction Générale
export const TAUX_NPEC_PLANCHER = 35;

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
