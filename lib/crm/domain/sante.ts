/**
 * Alertes santé des opportunités (spec Feature 1 §5 adaptée au CRM ; remplace
 * le cron prospect-alertes qui disparaît avec les prospects) :
 * - > 14 jours sans activité : notification in-app (crm.notifications) au owner ;
 * - > 30 jours sans activité : mail au owner + à la Direction.
 *
 * « Dernière activité » = max(opportunites.updated_at, dernière crm.activites,
 * dernier crm.rdv réalisé/planifié). Un RDV planifié dans le futur pousse la
 * dernière activité dans le futur : l'opportunité est considérée saine.
 *
 * Logique pure (testée) ; l'idempotence repose sur les colonnes
 * alerte_sante_14_at / alerte_sante_30_at posées par le cron après chaque envoi,
 * RÉ-ARMÉES dès qu'une activité plus récente que l'alerte apparaît.
 */

export const SANTE_14_MS = 14 * 86_400_000;
export const SANTE_30_MS = 30 * 86_400_000;

export type AlerteSante = 'sante_14' | 'sante_30';

export interface SanteOpp {
  statut: string;
  updated_at: string;
  alerte_sante_14_at: string | null;
  alerte_sante_30_at: string | null;
}

function epoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Timestamp (epoch ms) de la dernière activité : max de `updated_at` et des
 * timestamps d'activités/RDV fournis (ISO ; null/invalides ignorés).
 */
export function derniereActivite(
  opp: Pick<SanteOpp, 'updated_at'>,
  activites: Array<string | null | undefined> = [],
): number {
  let max = epoch(opp.updated_at) ?? 0;
  for (const a of activites) {
    const t = epoch(a);
    if (t != null && t > max) max = t;
  }
  return max;
}

/** Colonne d'idempotence associée à chaque alerte. */
export const ALERTE_SANTE_COLONNE = {
  sante_14: 'alerte_sante_14_at',
  sante_30: 'alerte_sante_30_at',
} as const satisfies Record<AlerteSante, string>;

/**
 * Alertes santé dues pour une opportunité à l'instant `now` (0, 1 ou 2).
 * `activites` = timestamps ISO des activités/RDV liés (la dernière activité est
 * calculée ici, via `derniereActivite`).
 */
export function alertesSanteDues(
  opp: SanteOpp,
  activites: Array<string | null | undefined>,
  now: Date,
): AlerteSante[] {
  if (opp.statut !== 'ouverte') return [];
  const derniere = derniereActivite(opp, activites);
  const inactifMs = now.getTime() - derniere;

  // Ré-armement : une alerte déjà posée ne bloque que si elle est POSTÉRIEURE
  // (ou égale) à la dernière activité ; sinon l'activité l'a ré-armée.
  const armee = (alerteAt: string | null): boolean => {
    const t = epoch(alerteAt);
    return t == null || t < derniere;
  };

  const dues: AlerteSante[] = [];
  if (inactifMs >= SANTE_14_MS && armee(opp.alerte_sante_14_at)) {
    dues.push('sante_14');
  }
  if (inactifMs >= SANTE_30_MS && armee(opp.alerte_sante_30_at)) {
    dues.push('sante_30');
  }
  return dues;
}
