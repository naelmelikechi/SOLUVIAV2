// Types alignes sur le contrat API V1 Eduvia /api/v1/quality/* tel qu'il sera
// publie par Eduvia. Cf discussion 2026-05-05 avec Eduvia Claude.
//
// Note sur l'usage en V1 SOLUVIA :
// - Les noms de champs sont en snake_case car c'est la convention API V1 Eduvia.
// - On conserve ce format dans toute la chaine (queries, components) pour
//   eviter une couche de mapping inutile.

export type CriterionType = 'qualiopi' | 'eduvia';

export type DeliverableRecurrence =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'
  | 'one_time'
  | 'continuous'
  | 'per_session'
  | 'per_intake'
  | 'per_cohort'
  | 'per_incident'
  | 'per_subcontractor'
  | 'on_change';

export type EvidenceStatus = 'to_review' | 'conform' | 'rejected' | 'expired';

export type DeliverableStatusValue =
  | 'missing'
  | 'to_review'
  | 'conform'
  | 'rejected'
  | 'expired';

export interface QualityCriterion {
  id: number;
  prefix: string;
  title: string;
  description: string;
  criterion_type: CriterionType;
  icon: string;
  color: { primary: string; light: string };
}

export interface QualityIndicator {
  id: number;
  code: string;
  number: number;
  title: string;
  criterion_id: number;
  /** Eduvia staff ID. SOLUVIA gere ses propres assignations cote DB locale */
  assigned_to_id: number | null;
}

export interface QualityDeliverable {
  id: number;
  code: string;
  title: string;
  recurrence: DeliverableRecurrence;
  indicator_id: number;
}

export interface QualityDeliverableStatus {
  id: number;
  campus_id: number;
  deliverable_id: number;
  status: DeliverableStatusValue;
  evidences_count: number;
  next_expiry: string | null;
}

export interface QualityEvidence {
  id: number;
  deliverable_id: number;
  campus_id: number;
  status: EvidenceStatus;
  expires_at: string | null;
  uploaded_by_id: number | null;
  // file_name / file_url peuvent etre null tant que la preuve n'a pas
  // termine son upload cote Eduvia (cf spec OpenAPI).
  file_name: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface QualityCampus {
  id: number;
  denomination: string;
  siret: string;
  uai_cfa: string | null;
  address: string;
  postcode: string;
  city: string;
  phone_number: string | null;
  email: string | null;
  is_company_cfa: boolean;
}

export interface QualityClientPingResult {
  ok: boolean;
  /** Mirror du status renvoye par GET /api/v1/status */
  authenticated:
    | 'ok'
    | 'no-key'
    | 'invalid-key'
    | 'inactive-key'
    | 'expired-key'
    | 'connection-error';
  version?: string;
  error?: string;
}

/**
 * Interface unifiee Mock <-> HTTP. Permet de coder l'UI SOLUVIA en parallele
 * de la publication des endpoints V1 cote Eduvia.
 */
export interface EduviaQualityClient {
  /** Test d'acces : verifie auth + connectivite */
  ping(): Promise<QualityClientPingResult>;

  /** Liste les campus accessibles via la cle API */
  listCampuses(): Promise<QualityCampus[]>;

  // --- Referentiel (fige, cacheable 24h) ---
  listCriteria(): Promise<QualityCriterion[]>;
  listIndicators(criterionId: number): Promise<QualityIndicator[]>;
  listDeliverables(indicatorId: number): Promise<QualityDeliverable[]>;

  // --- Operationnel par campus ---
  listDeliverableStatuses(
    campusId: number,
  ): Promise<QualityDeliverableStatus[]>;
  listEvidences(
    campusId: number,
    deliverableId: number,
  ): Promise<QualityEvidence[]>;

  // L'API Eduvia est en lecture seule cote SOLUVIA : aucune ecriture/upload
  // /validation possible (le depot des preuves se fait dans Eduvia directement).
}

// ---------------------------------------------------------------------------
// Helpers metier (pures, partages mock + http)
// ---------------------------------------------------------------------------

/** Duree d'expiration d'une preuve selon la recurrence du livrable */
export function computeExpiresAt(
  recurrence: DeliverableRecurrence,
  fromDate: Date = new Date(),
): string | null {
  const result = new Date(fromDate);
  switch (recurrence) {
    case 'weekly':
      result.setDate(result.getDate() + 7);
      break;
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'quarterly':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'biannual':
      result.setMonth(result.getMonth() + 6);
      break;
    case 'annual':
      result.setFullYear(result.getFullYear() + 1);
      break;
    default:
      // one_time, continuous, per_*, on_change : pas d'expiration auto
      return null;
  }
  return result.toISOString().split('T')[0]!;
}

/**
 * Recompute defensif du statut d'un livrable a partir des evidences.
 * Workaround pour le bug Eduvia connu : le job d'expiration ne recalcule pas
 * la table materialisee, donc le statut "conform" peut rester affiche alors
 * que toutes les preuves sont expirees. On corrige cote SOLUVIA a la lecture.
 *
 * Priorite : conform > to_review > rejected > expired > missing
 */
export function deriveDeliverableStatus(
  evidences: QualityEvidence[],
  now: Date = new Date(),
): DeliverableStatusValue {
  if (evidences.length === 0) return 'missing';

  const today = now.toISOString().split('T')[0]!;
  const effective = evidences.map((e) => {
    if (
      e.status === 'conform' &&
      e.expires_at !== null &&
      e.expires_at < today
    ) {
      // Force "expired" si la date est passee
      return { ...e, status: 'expired' as EvidenceStatus };
    }
    return e;
  });

  if (effective.some((e) => e.status === 'conform')) return 'conform';
  if (effective.some((e) => e.status === 'to_review')) return 'to_review';
  if (effective.some((e) => e.status === 'rejected')) return 'rejected';
  if (effective.every((e) => e.status === 'expired')) return 'expired';
  return 'missing';
}

/**
 * Calcul du % de completion pour un ensemble de livrables.
 *
 * `expectedTotal` est le nombre de livrables attendu cote referentiel
 * (Eduvia ne cree une ligne `deliverable_status` qu'apres premiere evidence,
 * donc `statuses.length` peut etre inferieur au referentiel reel). Si fourni,
 * il sert de denominateur ; sinon on retombe sur statuses.length.
 *
 * `total === 0` => 0% (et non 100%) : on ne pretend pas etre conforme par
 * absence de donnees. `valid` reste false dans ce cas.
 */
export function computeCompletion(
  statuses: Pick<QualityDeliverableStatus, 'status'>[],
  expectedTotal?: number,
): { percent: number; conform: number; total: number; valid: boolean } {
  const total = expectedTotal ?? statuses.length;
  const conform = statuses.filter((s) => s.status === 'conform').length;
  return {
    percent: total === 0 ? 0 : Math.round((conform / total) * 100),
    conform,
    total,
    valid: total > 0 && conform === total,
  };
}

/** Label francais pour la recurrence (UX) */
export const RECURRENCE_LABELS: Record<DeliverableRecurrence, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  biannual: 'Semestrielle',
  annual: 'Annuelle',
  one_time: 'Unique',
  continuous: 'Continue',
  per_session: 'Par session',
  per_intake: 'Par promotion',
  per_cohort: 'Par cohorte',
  per_incident: 'Par incident',
  per_subcontractor: 'Par sous-traitant',
  on_change: 'À chaque changement',
};

/** Label francais pour les statuts livrable */
export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatusValue, string> =
  {
    missing: 'Manquant',
    to_review: 'À valider',
    conform: 'Conforme',
    rejected: 'Rejeté',
    expired: 'Expiré',
  };

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  to_review: 'À valider',
  conform: 'Conforme',
  rejected: 'Rejeté',
  expired: 'Expiré',
};
