/**
 * Échéances du workflow de passation (spec Feature 6) : rappel Développeur à
 * 18h, escalade Direction à 48h après signature, rappel Référent CDP à 18h
 * après soumission, escalade Direction à 48h sans affectation.
 *
 * Logique pure et testée ; l'idempotence repose sur les colonnes timestamp
 * (rappel_dev_at, ...) posées par le cron après chaque envoi.
 */

export const H18_MS = 18 * 3_600_000;
export const H48_MS = 48 * 3_600_000;

export type EcheancePassation =
  | 'rappel_dev'
  | 'escalade_dev'
  | 'rappel_referent'
  | 'escalade_direction';

export interface EcheanceDoc {
  statut: string;
  created_at: string;
  signature_signee_at: string | null;
  soumise_at: string | null;
  rappel_dev_at: string | null;
  escalade_dev_at: string | null;
  rappel_referent_at: string | null;
  escalade_direction_at: string | null;
}

const STATUTS_COMPLETION = new Set(['generee', 'en_cours_completion']);
const STATUTS_TERMINES = new Set([
  'cdp_affecte',
  'diffusee_vague2',
  'archivee',
]);

function depuis(iso: string | null, now: Date, seuilMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t >= seuilMs;
}

/** Échéances dues pour un document à l'instant `now` (0, 1 ou plusieurs). */
export function echeancesDues(
  doc: EcheanceDoc,
  now: Date,
): EcheancePassation[] {
  const dues: EcheancePassation[] = [];
  // Ancre des délais Développeur : la signature fait foi, la génération sinon.
  const ancre = doc.signature_signee_at ?? doc.created_at;

  if (STATUTS_COMPLETION.has(doc.statut)) {
    if (!doc.rappel_dev_at && depuis(ancre, now, H18_MS)) {
      dues.push('rappel_dev');
    }
    if (!doc.escalade_dev_at && depuis(ancre, now, H48_MS)) {
      dues.push('escalade_dev');
    }
  }

  if (
    doc.statut === 'en_attente_arbitrage' &&
    !doc.rappel_referent_at &&
    depuis(doc.soumise_at, now, H18_MS)
  ) {
    dues.push('rappel_referent');
  }

  if (
    !STATUTS_TERMINES.has(doc.statut) &&
    !doc.escalade_direction_at &&
    depuis(ancre, now, H48_MS)
  ) {
    dues.push('escalade_direction');
  }

  return dues;
}

/** Colonne d'idempotence associée à chaque échéance. */
export const ECHEANCE_COLONNE = {
  rappel_dev: 'rappel_dev_at',
  escalade_dev: 'escalade_dev_at',
  rappel_referent: 'rappel_referent_at',
  escalade_direction: 'escalade_direction_at',
} as const satisfies Record<EcheancePassation, string>;
