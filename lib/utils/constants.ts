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
  | 'drh'
  | 'soutien';

export const ROLE_DECISION_LABELS: Record<RoleDecisionContact, string> = {
  signataire: 'Signataire',
  sponsor: 'Sponsor',
  operationnel: 'Opérationnel',
  drh: 'Référent DRH',
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

// Statut de signature de contrat (Feature 5)
export type StatutSignature =
  | 'brouillon'
  | 'envoyee'
  | 'signee'
  | 'refusee'
  | 'expiree'
  | 'annulee';

export const STATUT_SIGNATURE_LABELS: Record<StatutSignature, string> = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée',
  signee: 'Signée',
  refusee: 'Refusée',
  expiree: 'Expirée',
  annulee: 'Annulée',
};

export const STATUT_SIGNATURE_COLORS: Record<StatutSignature, BadgeColor> = {
  brouillon: 'gray',
  envoyee: 'blue',
  signee: 'green',
  refusee: 'red',
  expiree: 'orange',
  annulee: 'gray',
};

// Disponibilité déclarée d'un CDP (Feature 7, V1 = champ libre)
export type DispoCdp = 'disponible' | 'tendu' | 'sature';

export const DISPO_CDP_LABELS: Record<DispoCdp, string> = {
  disponible: 'Disponible',
  tendu: 'Tendu',
  sature: 'Saturé',
};

export const DISPO_CDP_COLORS: Record<DispoCdp, BadgeColor> = {
  disponible: 'green',
  tendu: 'orange',
  sature: 'red',
};

// Saturation théorique d'un CDP (Feature 7) : le seuil le plus contraignant.
export const CDP_SATURATION_CLIENTS = 5;
export const CDP_SATURATION_ALTERNANTS = 300;

// Statut d'une synthèse de passation (Feature 6). Machine à états spec :
// generee -> en_cours_completion -> en_attente_arbitrage -> cdp_affecte ->
// archivee. Les valeurs diffusee_vague1/diffusee_vague2 sont legacy (mappées
// au backfill) mais restent dans l'enum Postgres.
export type StatutSynthese =
  | 'generee'
  | 'en_cours_completion'
  | 'en_attente_arbitrage'
  | 'cdp_affecte'
  | 'diffusee_vague1'
  | 'diffusee_vague2'
  | 'archivee';

export const STATUT_SYNTHESE_LABELS: Record<StatutSynthese, string> = {
  generee: 'Générée',
  en_cours_completion: 'En cours de complétion',
  en_attente_arbitrage: "En attente d'arbitrage",
  cdp_affecte: 'CDP affecté',
  diffusee_vague1: "En attente d'arbitrage",
  diffusee_vague2: 'CDP affecté',
  archivee: 'Archivée',
};

export const STATUT_SYNTHESE_COLORS: Record<StatutSynthese, BadgeColor> = {
  generee: 'blue',
  en_cours_completion: 'orange',
  en_attente_arbitrage: 'purple',
  cdp_affecte: 'green',
  diffusee_vague1: 'purple',
  diffusee_vague2: 'green',
  archivee: 'gray',
};

// Tunnel d'acquisition (maquette synthèse) : mapping de type_prospect.
export const TUNNEL_LABELS: Record<TypeProspect, string> = {
  entreprise: 'Tunnel A - création complète',
  cfa: 'Tunnel B - CFA existant',
};

// Modalité de formation (section 4 de la synthèse)
export type TypeFormation = 'presentiel' | 'distanciel' | 'hybride';

export const TYPE_FORMATION_LABELS: Record<TypeFormation, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride (présentiel + e-learning)',
};

// Initiateur du premier contact (section 3)
export type InitiateurContact = 'soluvia' | 'prospect';

export const INITIATEUR_LABELS: Record<InitiateurContact, string> = {
  soluvia: 'Soluvia',
  prospect: 'Le prospect',
};

// Section 8 structurée : recommandation d'affectation du Développeur
export type TypologieClient =
  | 'exigeant'
  | 'collaboratif'
  | 'autonome'
  | 'accompagnement_fort';

export const TYPOLOGIE_CLIENT_LABELS: Record<TypologieClient, string> = {
  exigeant: 'Exigeant',
  collaboratif: 'Collaboratif',
  autonome: 'Autonome',
  accompagnement_fort: "Besoin d'accompagnement fort",
};

export type NiveauCharge = 'faible' | 'moyenne' | 'forte';

export const NIVEAU_CHARGE_LABELS: Record<NiveauCharge, string> = {
  faible: 'Faible',
  moyenne: 'Moyenne',
  forte: 'Forte',
};

export type NiveauRisque = 'faible' | 'moyen' | 'fort';

export const NIVEAU_RISQUE_LABELS: Record<NiveauRisque, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  fort: 'Fort',
};

// Calendrier prévisionnel (section 5) : 10 jalons ordonnés, clés du JSONB
// prospects.calendrier_previsionnel (valeurs 'YYYY-MM').
export const JALONS_CALENDRIER = [
  { key: 'demarrage', label: 'Démarrage Mission A' },
  { key: 'recrut_directeur', label: 'Recrutement Directeur de centre' },
  { key: 'nda', label: 'Obtention du NDA' },
  { key: 'qualiopi', label: 'Obtention Qualiopi' },
  { key: 'uai', label: "Obtention de l'UAI" },
  { key: 'agrements', label: "Demande d'agréments (DREETS)" },
  { key: 'opco', label: 'Inscription aux OPCO' },
  { key: 'recrut_formateurs', label: 'Recrutement des formateurs' },
  { key: 'premiere_cohorte', label: '1ère inscription des cohortes' },
  { key: 'premiere_facture', label: '1ères facturations Soluvia' },
] as const;

export type JalonCalendrierKey = (typeof JALONS_CALENDRIER)[number]['key'];
