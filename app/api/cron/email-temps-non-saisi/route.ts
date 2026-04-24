import { NextResponse } from 'next/server';
import { format, startOfWeek, addDays } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  sendTempsHebdoRecapEmail,
  type JourSaisie,
} from '@/lib/email/notifications';
import { MAX_HEURES_JOUR } from '@/lib/utils/constants';
import { tryAcquireEmailLock, isoWeekKey } from '@/lib/email/send-log';

export const maxDuration = 60;

// Weekly reminder email to CDPs (Friday 12h Paris): recap of hours logged
// Monday -> Friday morning, with how much is still missing + reminder to fill
// Friday afternoon before the weekend.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
  const weekDayStrs = weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const mondayStr = weekDayStrs[0]!;
  const fridayStr = weekDayStrs[4]!;

  const lockAcquired = await tryAcquireEmailLock(
    supabase,
    'email-temps-non-saisi',
    isoWeekKey(today),
  );
  if (!lockAcquired) {
    return NextResponse.json({
      success: true,
      sent: 0,
      skipped: 'already_sent',
    });
  }

  try {
    // Fetch jours fériés of the current week
    const { data: feriesRows } = await supabase
      .from('jours_feries')
      .select('date')
      .gte('date', mondayStr)
      .lte('date', fridayStr);
    const feries = new Set((feriesRows ?? []).map((r) => r.date));

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

    const userIds = users.map((u) => u.id);
    const { data: saisies } = await supabase
      .from('saisies_temps')
      .select('user_id, date, heures')
      .in('user_id', userIds)
      .gte('date', mondayStr)
      .lte('date', fridayStr);

    // Aggregate: Map<userId, Map<date, heuresTotal>>
    const heuresByUserByDay = new Map<string, Map<string, number>>();
    for (const s of saisies ?? []) {
      let userMap = heuresByUserByDay.get(s.user_id);
      if (!userMap) {
        userMap = new Map();
        heuresByUserByDay.set(s.user_id, userMap);
      }
      userMap.set(s.date, (userMap.get(s.date) ?? 0) + (s.heures ?? 0));
    }

    let sent = 0;
    let failed = 0;
    let skippedComplete = 0;

    for (const user of users) {
      const userMap = heuresByUserByDay.get(user.id) ?? new Map();

      const jours: JourSaisie[] = weekDayStrs.map((dateStr, idx) => {
        const isFerie = feries.has(dateStr);
        const attendu = isFerie ? 0 : MAX_HEURES_JOUR;
        const saisi = Math.round((userMap.get(dateStr) ?? 0) * 100) / 100;
        return {
          date: dateStr,
          jourIndex: idx, // 0=lun, 4=ven
          saisi,
          attendu,
          ferie: isFerie,
        };
      });

      const totalSaisi = jours.reduce((acc, j) => acc + j.saisi, 0);
      const totalAttendu = jours.reduce((acc, j) => acc + j.attendu, 0);
      const heuresManquantes =
        Math.round((totalAttendu - totalSaisi) * 100) / 100;

      // Don't email if the week is already fully logged
      if (heuresManquantes <= 0) {
        skippedComplete++;
        continue;
      }

      const result = await sendTempsHebdoRecapEmail({
        to: user.email,
        prenom: user.prenom,
        jours,
        heuresManquantes,
      });

      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-temps', 'Rappels hebdo envoyés', {
      sent,
      failed,
      skippedComplete,
    });
    return NextResponse.json({ success: true, sent, failed, skippedComplete });
  } catch (err) {
    logger.error('cron.email-temps', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
