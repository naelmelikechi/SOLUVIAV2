import {
  listCampusesForClient,
  getDeliverableStatuses,
} from '@/lib/queries/qualiopi';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'queries.qualiopi-stats';

export interface QualiopiCompletion {
  realise: number; // nb deliverable_statuses 'conform' (tous campus)
  total: number; // nb deliverable_statuses total (tous campus)
}

/**
 * Calcule la completion Qualiopi pour un client (CFA) :
 * total = nombre de deliverable_statuses sur tous les campus
 * realise = nombre de statuses avec status === 'conform'
 *
 * Source : Eduvia /quality/* via le client API du CFA. Si le CFA n'a pas
 * de cle API active, retourne { realise: 0, total: 0 }.
 */
export async function computeQualiopiCompletion(
  clientId: string,
): Promise<QualiopiCompletion> {
  try {
    const campuses = await listCampusesForClient(clientId);
    if (campuses.length === 0) return { realise: 0, total: 0 };

    const statusesByCampus = await Promise.all(
      campuses.map((c) => getDeliverableStatuses(clientId, c.id)),
    );

    let realise = 0;
    let total = 0;
    for (const statuses of statusesByCampus) {
      total += statuses.length;
      realise += statuses.filter((s) => s.status === 'conform').length;
    }
    return { realise, total };
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
