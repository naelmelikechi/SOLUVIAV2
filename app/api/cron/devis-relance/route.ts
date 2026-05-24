import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendDevisRelanceEmail } from '@/lib/email/devis-templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// CRON: Envoie les relances J+7 et J+14 pour les devis envoyes non repondus
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 86_400_000,
  ).toISOString();
  const fifteenDaysAgo = new Date(
    now.getTime() - 15 * 86_400_000,
  ).toISOString();

  // J+7 : envoye depuis entre 7 et 14 jours, relance_j7 pas encore envoyee
  const { data: j7, error: j7Err } = await supabase
    .from('devis')
    .select('id, ref')
    .eq('statut', 'envoye')
    .eq('relances_actives', true)
    .lte('date_envoi', sevenDaysAgo)
    .gt('date_envoi', fourteenDaysAgo)
    .is('relance_j7_envoyee_at', null);

  if (j7Err) {
    logger.error('cron.devis-relance', 'j7 select failed', { error: j7Err });
    return NextResponse.json({ error: j7Err.message }, { status: 500 });
  }

  // J+14 : envoye depuis entre 14 et 15 jours, relance_j14 pas encore envoyee
  const { data: j14, error: j14Err } = await supabase
    .from('devis')
    .select('id, ref')
    .eq('statut', 'envoye')
    .eq('relances_actives', true)
    .lte('date_envoi', fourteenDaysAgo)
    .gt('date_envoi', fifteenDaysAgo)
    .is('relance_j14_envoyee_at', null);

  if (j14Err) {
    logger.error('cron.devis-relance', 'j14 select failed', { error: j14Err });
    return NextResponse.json({ error: j14Err.message }, { status: 500 });
  }

  let sentJ7 = 0;
  let sentJ14 = 0;

  for (const d of j7 ?? []) {
    try {
      await sendDevisRelanceEmail({ devisId: d.id, niveau: 'j7' });
      await supabase
        .from('devis')
        .update({ relance_j7_envoyee_at: now.toISOString() })
        .eq('id', d.id);
      sentJ7++;
    } catch (e) {
      logger.warn('cron.devis-relance', `j7 ${d.ref} failed`, { error: e });
    }
  }

  for (const d of j14 ?? []) {
    try {
      await sendDevisRelanceEmail({ devisId: d.id, niveau: 'j14' });
      await supabase
        .from('devis')
        .update({ relance_j14_envoyee_at: now.toISOString() })
        .eq('id', d.id);
      sentJ14++;
    } catch (e) {
      logger.warn('cron.devis-relance', `j14 ${d.ref} failed`, { error: e });
    }
  }

  logger.info('cron.devis-relance', 'relances envoyees', { sentJ7, sentJ14 });
  return NextResponse.json({ sentJ7, sentJ14 });
}
