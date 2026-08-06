import { env } from '@/lib/env';
import type { FinalizedFiche } from './types';

/**
 * Tire la liste des fiches finalisées depuis l'endpoint export de Soluvia-Process.
 * Lève si la config est absente ou si la réponse n'est pas OK (le cron conserve
 * alors l'index existant — pas de wipe).
 */
export async function fetchFinalizedFiches(): Promise<FinalizedFiche[]> {
  const base = env.PROCESS_SOURCE_URL;
  const secret = env.PROCESS_SYNC_SECRET;
  if (!base || !secret) {
    throw new Error('PROCESS_SOURCE_URL et PROCESS_SYNC_SECRET requis');
  }
  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/export/finalized-fiches`,
    {
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      // Sans timeout, une source qui accepte la connexion sans jamais repondre
      // tient le cron jusqu'au maxDuration de la route.
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) {
    throw new Error(`export source HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  // Le `as { fiches: FinalizedFiche[] }` suivi de `?? []` transformait un champ
  // absent, RENOMME, ou une reponse 200 de forme differente (proxy, page
  // d'erreur applicative) en liste vide. Combine a la suppression des fiches
  // absentes de la source, cela vidait l'index sans qu'aucune erreur ne
  // remonte : le cron repondait { ok: true }. On exige donc explicitement un
  // tableau, et on leve sinon pour que l'index existant soit conserve.
  const fiches =
    typeof json === 'object' && json !== null
      ? (json as { fiches?: unknown }).fiches
      : undefined;
  if (!Array.isArray(fiches)) {
    throw new Error(
      'export source : champ `fiches` absent ou non-tableau (reponse 200 de forme inattendue) - index conserve',
    );
  }
  return fiches as FinalizedFiche[];
}
