import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

/**
 * Deletes team_messages older than 48 hours.
 * Wired to hourly Vercel cron (see vercel.json).
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('team_messages')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    logger.error('cron.chat_cleanup', 'delete failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff });
}
