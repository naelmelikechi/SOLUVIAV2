import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendFenetreFinEmail } from '@/lib/email/notifications';
import { tryAcquireEmailLock } from '@/lib/email/send-log';
import { format } from 'date-fns';

export const maxDuration = 60;

// Sent on the 2nd of each month: the billing window closes tomorrow (3rd).
// Only CDPs with remaining pending echeances, plus all active admins.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  const lockAcquired = await tryAcquireEmailLock(
    supabase,
    'email-fenetre-fin',
    format(new Date(), 'yyyy-MM'),
  );
  if (!lockAcquired) {
    return NextResponse.json({
      success: true,
      sent: 0,
      skipped: 'already_sent',
    });
  }

  try {
    // Pending echeances grouped by CDP
    const { data: echeances, error: echError } = await supabase
      .from('echeances')
      .select(
        `
        id,
        projet:projets!echeances_projet_id_fkey(cdp_id)
      `,
      )
      .is('facture_id', null)
      .eq('validee', false);

    if (echError) {
      logger.error('cron.email-fenetre-fin', echError);
      return NextResponse.json({ error: echError.message }, { status: 500 });
    }

    const countByCdp = new Map<string, number>();
    for (const ech of echeances ?? []) {
      const cdpId = ech.projet?.cdp_id;
      if (!cdpId) continue;
      countByCdp.set(cdpId, (countByCdp.get(cdpId) ?? 0) + 1);
    }

    const totalPending = echeances?.length ?? 0;

    if (totalPending === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'Aucune échéance en attente',
      });
    }

    // Fetch active users (admins + CDPs with remaining echeances)
    const { data: users } = await supabase
      .from('users')
      .select('id, email, prenom, role')
      .eq('actif', true)
      .in('role', ['admin', 'superadmin', 'cdp']);

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const nb =
        user.role === 'admin' || user.role === 'superadmin'
          ? totalPending
          : (countByCdp.get(user.id) ?? 0);
      if (nb === 0) continue;

      const result = await sendFenetreFinEmail({
        to: user.email,
        prenom: user.prenom,
        nbEcheancesRestantes: nb,
      });
      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-fenetre-fin', 'Rappel envoyé', {
      sent,
      failed,
      totalPending,
    });
    return NextResponse.json({ success: true, sent, failed, totalPending });
  } catch (err) {
    logger.error('cron.email-fenetre-fin', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
