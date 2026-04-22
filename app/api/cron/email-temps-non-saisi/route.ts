import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendTempsNonSaisiEmail } from '@/lib/email/notifications';
import { MAX_HEURES_JOUR } from '@/lib/utils/constants';

// Daily reminder email to CDPs who haven't reached MAX_HEURES_JOUR today.
// Skipped on weekends (CRON schedule filter) and jours fériés.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  try {
    // Skip if today is a jour férié
    const { data: ferie } = await supabase
      .from('jours_feries')
      .select('id')
      .eq('date', today)
      .maybeSingle();

    if (ferie) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'jour férié',
      });
    }

    // Fetch active CDPs
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, prenom')
      .eq('role', 'cdp')
      .eq('actif', true);

    if (usersError) {
      logger.error('cron.email-temps', usersError);
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    // Fetch today's saisies for these users in one query
    const userIds = users.map((u) => u.id);
    const { data: saisies } = await supabase
      .from('saisies_temps')
      .select('user_id, heures')
      .in('user_id', userIds)
      .eq('date', today);

    const heuresParUser = new Map<string, number>();
    for (const s of saisies ?? []) {
      heuresParUser.set(
        s.user_id,
        (heuresParUser.get(s.user_id) ?? 0) + (s.heures ?? 0),
      );
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const heures = heuresParUser.get(user.id) ?? 0;
      if (heures >= MAX_HEURES_JOUR) continue;

      const manquantes = Math.round((MAX_HEURES_JOUR - heures) * 100) / 100;

      const result = await sendTempsNonSaisiEmail({
        to: user.email,
        prenom: user.prenom,
        dateJour: today,
        heuresManquantes: manquantes,
      });

      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-temps', 'Rappels envoyés', { sent, failed });
    return NextResponse.json({ success: true, sent, failed });
  } catch (err) {
    logger.error('cron.email-temps', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
