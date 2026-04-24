import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 30;

// Volume de securite par execution: au-dela, on logue et on attend le
// prochain tick horaire. Protege contre un timeout sur une table qui
// aurait explose (chat tres actif, purge manquee pendant plusieurs jours).
const BATCH_LIMIT = 1000;

/**
 * Deletes team_messages older than 48 hours.
 * Wired to hourly Vercel cron (see vercel.json).
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Supabase ne supporte pas directement delete().limit(), on selectionne
  // d'abord les ids a supprimer puis on supprime par IN.
  const { data: toDelete, error: selectError } = await supabase
    .from('team_messages')
    .select('id')
    .lt('created_at', cutoff)
    .limit(BATCH_LIMIT);

  if (selectError) {
    logger.error('cron.chat_cleanup', 'select failed', { error: selectError });
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const ids = (toDelete ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, cutoff });
  }

  const { error: deleteError } = await supabase
    .from('team_messages')
    .delete()
    .in('id', ids);

  if (deleteError) {
    logger.error('cron.chat_cleanup', 'delete failed', { error: deleteError });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (ids.length >= BATCH_LIMIT) {
    logger.warn(
      'cron.chat_cleanup',
      'batch limit atteint, backlog probable a surveiller',
      { deleted: ids.length, cutoff },
    );
  }

  return NextResponse.json({ ok: true, deleted: ids.length, cutoff });
}
