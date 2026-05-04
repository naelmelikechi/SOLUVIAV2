import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
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
  supabase: SupabaseClient<Database>,
  job: string,
  periodeKey: string,
  metadata?: Record<string, Json>,
): Promise<boolean> {
  const { error } = await supabase.from('email_send_log').insert({
    job,
    periode_key: periodeKey,
    metadata: (metadata ?? null) as Json | null,
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
 * Libere un verrou email_send_log pour permettre un retry au prochain cron.
 * A appeler quand un cron a acquis le verrou mais n'a finalement envoye aucun
 * email (ex: tous les envois Resend ont echoue). Sans release, l'idempotence
 * bloquerait le retry sur la meme periode meme apres correction du probleme.
 */
export async function releaseEmailLock(
  supabase: SupabaseClient<Database>,
  job: string,
  periodeKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_send_log')
    .delete()
    .eq('job', job)
    .eq('periode_key', periodeKey);
  if (error) {
    logger.warn(SCOPE, 'failed to release email lock', {
      job,
      periode_key: periodeKey,
      error,
    });
  }
}

/**
 * Wrapper qui pose un verrou avant la fonction et le libere si elle renvoie
 * `sent: 0` (aucun email envoye). Permet aux crons de retry au prochain run
 * sans toucher manuellement le verrou. Sur exception, le verrou est aussi
 * libere pour ne pas bloquer la prochaine execution.
 *
 * Retourne `null` si le verrou est deja pris (le job a deja tourne pour cette
 * periode), sinon le resultat de fn().
 */
export async function withEmailLock<T extends { sent: number }>(
  supabase: SupabaseClient<Database>,
  job: string,
  periodeKey: string,
  fn: () => Promise<T>,
  metadata?: Record<string, Json>,
): Promise<T | null> {
  const acquired = await tryAcquireEmailLock(
    supabase,
    job,
    periodeKey,
    metadata,
  );
  if (!acquired) return null;

  try {
    const result = await fn();
    if (result.sent === 0) {
      await releaseEmailLock(supabase, job, periodeKey);
    }
    return result;
  } catch (err) {
    await releaseEmailLock(supabase, job, periodeKey);
    throw err;
  }
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
