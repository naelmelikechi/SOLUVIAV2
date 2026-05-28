// POST /api/admin/welcome-emails/broadcast
// Body : { dryRun?: boolean } (defaut true)
// Auth : admin ou superadmin uniquement.
// dryRun = true  : retourne la liste des destinataires eligibles sans rien envoyer.
// dryRun = false : envoie a chaque destinataire eligible, met a jour welcome_email_sent_at.

import { NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/guards';
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

export async function POST(req: Request) {
  const auth = await checkAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // body vide accepte
  }
  const dryRun = body.dryRun ?? true;

  const adminClient = createAdminClient();
  const { data: rows, error } = await adminClient
    .from('users')
    .select('email, prenom, role, actif, welcome_email_sent_at');

  if (error) {
    logger.error('welcome-broadcast', 'fetch users failed', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = filterEligibleRecipients(rows as BroadcastUser[]);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalUsers: rows.length,
      eligibleCount: eligible.length,
      recipients: eligible.map((u) => ({
        email: u.email,
        role: u.role,
        prenom: u.prenom,
      })),
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
          'welcome-broadcast',
          'update welcome_email_sent_at failed',
          { email: u.email, error: updErr.message },
        );
      }
    } else {
      failed++;
      failures.push({ email: u.email, error: result.error ?? 'unknown' });
      logger.error('welcome-broadcast', 'send failed', {
        email: u.email,
        error: result.error,
      });
    }
  }

  return NextResponse.json({
    dryRun: false,
    sent,
    failed,
    failures,
    totalEligible: eligible.length,
  });
}
