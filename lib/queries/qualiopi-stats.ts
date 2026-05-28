import {
  listCampusesForClient,
  getDeliverableStatuses,
  getReferentiel,
} from '@/lib/queries/qualiopi';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'queries.qualiopi-stats';

export interface QualiopiCompletion {
  realise: number; // nb livrables `conform` (tous campus)
  total: number; // nb livrables attendus dans le referentiel * nb campus
}

/**
 * Calcule la completion Qualiopi pour un client (CFA).
 *
 * Denominateur : nb livrables du referentiel * nb campus (le referentiel est
 * partage entre campus d'une meme instance Eduvia, chaque campus doit valider
 * tous les livrables). On ne se base PAS sur statuses.length car Eduvia ne
 * cree une ligne `deliverable_status` qu'a partir de la premiere evidence
 * deposee : un livrable vierge serait sinon exclu et gonflerait le ratio.
 *
 * Si le CFA n'a pas de cle API active, retourne { realise: 0, total: 0 }.
 */
async function computeQualiopiCompletion(
  clientId: string,
): Promise<QualiopiCompletion> {
  try {
    const [campuses, referentiel] = await Promise.all([
      listCampusesForClient(clientId),
      getReferentiel(clientId),
    ]);
    if (campuses.length === 0) return { realise: 0, total: 0 };

    const totalDeliverablesReferentiel = referentiel.criteria.reduce(
      (acc, c) => {
        const inds = referentiel.indicatorsByCriterion.get(c.id) ?? [];
        return (
          acc +
          inds.reduce(
            (a, i) =>
              a + (referentiel.deliverablesByIndicator.get(i.id)?.length ?? 0),
            0,
          )
        );
      },
      0,
    );

    const statusesByCampus = await Promise.all(
      campuses.map((c) => getDeliverableStatuses(clientId, c.id)),
    );

    let realise = 0;
    for (const statuses of statusesByCampus) {
      realise += statuses.filter((s) => s.status === 'conform').length;
    }
    return {
      realise,
      total: totalDeliverablesReferentiel * campuses.length,
    };
  } catch (err) {
    logger.error(SCOPE, 'computeQualiopiCompletion failed', { clientId, err });
    return { realise: 0, total: 0 };
  }
}

/**
 * Variante batch : calcule la completion pour une liste de clients en parallele.
 * Utilise dans les KPI CDP (indicateurs.ts) ou un CDP suit plusieurs CFA.
 */
export async function computeQualiopiCompletionForClients(
  clientIds: string[],
): Promise<Map<string, QualiopiCompletion>> {
  const result = new Map<string, QualiopiCompletion>();
  if (clientIds.length === 0) return result;

  const completions = await Promise.all(
    clientIds.map((id) =>
      computeQualiopiCompletion(id).then((c) => [id, c] as const),
    ),
  );
  for (const [id, c] of completions) {
    result.set(id, c);
  }
  return result;
}
