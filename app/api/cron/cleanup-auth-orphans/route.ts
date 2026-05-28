import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 60;

// On laisse 24h de marge : un invite peut etre en cours (createUser deja fait,
// INSERT public.users en train de retry). Au-dela, c est un vrai orphelin.
const OLDER_THAN_HOURS = 24;
// Limite de securite par execution. Si on a plus de 50 orphelins, c est un
// signal d alarme - on logge et on attend le prochain tick (24h apres).
const BATCH_LIMIT = 50;

/**
 * Supprime les auth.users sans row public.users associee, plus vieux que 24h.
 *
 * Ces orphelins apparaissent quand inviteUser cree l auth.user puis fail a
 * inserer public.users, ET que le rollback echoue aussi (cas exceptionnel,
 * documente dans docs/RUNBOOKS.md).
 *
 * Sans ce nettoyage, une re-invitation avec le meme email est bloquee
 * indefiniment ("User already registered" cote Supabase Auth).
 *
 * Wired au CRON Vercel quotidien (vercel.json).
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  const { data: orphans, error: listError } = await supabase.rpc(
    'list_auth_orphans',
    { p_older_than_hours: OLDER_THAN_HOURS },
  );

  if (listError) {
    logger.error('cron.cleanup_auth_orphans', 'list_auth_orphans failed', {
      error: listError,
    });
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const rows = (orphans ?? []).slice(0, BATCH_LIMIT);
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  let deleted = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of rows) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const { error } = await supabase.auth.admin.deleteUser(row.id);
    if (error) {
      failures.push({ id: row.id, error: error.message });
      logger.error('cron.cleanup_auth_orphans', 'deleteUser failed', {
        userId: row.id,
        email: row.email,
        error: error.message,
      });
    } else {
      deleted++;
    }
  }

  if ((orphans ?? []).length > BATCH_LIMIT) {
    logger.warn(
      'cron.cleanup_auth_orphans',
      'batch limit atteint, backlog probable a surveiller',
      { found: (orphans ?? []).length, limit: BATCH_LIMIT },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted,
    failures: failures.length,
    found: (orphans ?? []).length,
  });
}
