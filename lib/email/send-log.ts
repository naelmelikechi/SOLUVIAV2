import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

const SCOPE = 'email.send-log';

/**
 * Pose un verrou d'idempotence dans email_send_log avant d'envoyer un email batch.
 * Retourne true si le verrou est pose (l'appelant doit envoyer), false si la
 * periode a deja ete traitee.
 *
 * Une insertion concurrente (retry simultane) est neutralisee par l'unique
 * constraint (job, periode_key) : on recupere 23505 et on renvoie false.
 */
export async function tryAcquireEmailLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  job: string,
  periodeKey: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('email_send_log' as any)
    .insert({
      job,
      periode_key: periodeKey,
      metadata: metadata ?? null,
    });

  if (!error) return true;

  // 23505 = unique_violation : la cle (job, periode_key) existe deja.
  if (error.code === '23505') {
    logger.info(SCOPE, 'email job already sent for period, skipping', {
      job,
      periode_key: periodeKey,
    });
    return false;
  }

  logger.error(SCOPE, 'failed to acquire email lock, sending anyway', {
    job,
    periode_key: periodeKey,
    error,
  });
  // Fail-open : si la table est absente ou inaccessible, on n'empeche pas
  // l'envoi (regression de disponibilite > regression d'idempotence).
  return true;
}

/**
 * Cle ISO week : "2026-W17". `date` doit deja etre en timezone voulue.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
