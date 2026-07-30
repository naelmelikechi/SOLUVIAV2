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
    },
  );
  if (!res.ok) {
    throw new Error(`export source HTTP ${res.status}`);
  }
  const json = (await res.json()) as { fiches: FinalizedFiche[] };
  return json.fiches ?? [];
}
