import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import {
  filterEligibleRecipients,
  type BroadcastUser,
  type Role,
} from '@/lib/email/welcome-broadcast';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Broadcast welcome emails. Idempotent : filterEligibleRecipients ne
// renvoie que les users avec welcome_email_sent_at = NULL, donc relancer
// le cron apres l'envoi initial est un no-op (rien a envoyer).
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const adminClient = createAdminClient();
  const { data: rows, error } = await adminClient
    .from('users')
    .select('email, prenom, role, actif, welcome_email_sent_at');

  if (error) {
    logger.error('cron.welcome-emails-broadcast', 'fetch users failed', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = filterEligibleRecipients(rows as BroadcastUser[]);

  if (eligible.length === 0) {
    return NextResponse.json({
      success: true,
      sent: 0,
      message: 'Aucun destinataire eligible',
    });
  }

  let sent = 0;
  let failed = 0;
  const failures: { email: string; error: string }[] = [];

  for (const u of eligible) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    const result = await sendWelcomeEmail({
      email: u.email,
      prenom: u.prenom,
      role: u.role as Role,
    });
    if (result.success) {
      sent++;
      const { error: updErr } = await adminClient
        .from('users')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('email', u.email);
      if (updErr) {
        logger.error(
          'cron.welcome-emails-broadcast',
          'update welcome_email_sent_at failed',
          { email: u.email, error: updErr.message },
        );
      }
    } else {
      failed++;
      failures.push({ email: u.email, error: result.error ?? 'unknown' });
      logger.error('cron.welcome-emails-broadcast', 'send failed', {
        email: u.email,
        error: result.error,
      });
    }
  }

  logger.info('cron.welcome-emails-broadcast', 'Broadcast termine', {
    sent,
    failed,
    totalEligible: eligible.length,
  });

  return NextResponse.json({
    success: true,
    sent,
    failed,
    failures,
    totalEligible: eligible.length,
  });
}
