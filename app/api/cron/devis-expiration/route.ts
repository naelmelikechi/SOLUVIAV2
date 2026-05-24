import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// CRON: Expire les devis envoyes dont la date de validite est depassee
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: candidats, error: selectErr } = await supabase
    .from('devis')
    .select('id, ref, client_id, date_validite')
    .eq('statut', 'envoye')
    .lt('date_validite', today);

  if (selectErr) {
    logger.error('cron.devis-expiration', 'select failed', {
      error: selectErr,
    });
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  if (!candidats || candidats.length === 0) {
    return NextResponse.json({ expired: 0, message: 'Aucun devis a expirer' });
  }

  const ids = candidats.map((d) => d.id);
  const { error: updateErr } = await supabase
    .from('devis')
    .update({ statut: 'expire' })
    .in('id', ids);

  if (updateErr) {
    logger.error('cron.devis-expiration', 'update failed', {
      error: updateErr,
    });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  logger.info('cron.devis-expiration', `expired ${ids.length} devis`, {
    refs: candidats.map((c) => c.ref),
  });
  return NextResponse.json({
    expired: ids.length,
    refs: candidats.map((c) => c.ref),
  });
}
