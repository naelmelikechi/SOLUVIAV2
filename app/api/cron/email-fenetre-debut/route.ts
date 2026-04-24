import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendFenetreDebutEmail } from '@/lib/email/notifications';
import { FENETRE_FACTURATION_FIN } from '@/lib/utils/constants';
import { tryAcquireEmailLock } from '@/lib/email/send-log';

export const maxDuration = 60;

// Sent on the 25th of each month to admins + CDPs with pending echeances.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date();

  // Fenêtre ferme le FENETRE_FACTURATION_FIN du mois suivant
  const dateFinFenetre = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    FENETRE_FACTURATION_FIN,
  );
  const dateFinStr = format(dateFinFenetre, 'yyyy-MM-dd');

  // Cle d'idempotence indexee sur la fenetre cible (mois de fermeture), pas
  // sur la date courante: si Vercel rejoue le cron apres minuit ou deborde
  // sur le jour suivant, la cle reste identique et l'email ne part pas deux
  // fois. `dateFinFenetre` porte le mois metier, donc c'est le bon ancrage.
  const lockAcquired = await tryAcquireEmailLock(
    supabase,
    'email-fenetre-debut',
    format(dateFinFenetre, 'yyyy-MM'),
  );
  if (!lockAcquired) {
    return NextResponse.json({
      success: true,
      sent: 0,
      skipped: 'already_sent',
    });
  }

  try {
    // Fetch pending echeances grouped by CDP
    const { data: echeances, error: echError } = await supabase
      .from('echeances')
      .select(
        `
        id,
        projet:projets!echeances_projet_id_fkey(cdp_id, backup_cdp_id)
      `,
      )
      .is('facture_id', null)
      .eq('validee', false);

    if (echError) {
      logger.error('cron.email-fenetre-debut', echError);
      return NextResponse.json({ error: echError.message }, { status: 500 });
    }

    const countByCdp = new Map<string, number>();
    for (const ech of echeances ?? []) {
      const cdpId = ech.projet?.cdp_id;
      if (!cdpId) continue;
      countByCdp.set(cdpId, (countByCdp.get(cdpId) ?? 0) + 1);
    }

    // Fetch all active users (admins + CDPs)
    const { data: users } = await supabase
      .from('users')
      .select('id, email, prenom, role')
      .eq('actif', true)
      .in('role', ['admin', 'cdp']);

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const totalPending = echeances?.length ?? 0;

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const nb =
        user.role === 'admin' ? totalPending : (countByCdp.get(user.id) ?? 0);

      // CDP with no pending echeances: skip; admin always gets the digest
      if (user.role === 'cdp' && nb === 0) continue;

      const result = await sendFenetreDebutEmail({
        to: user.email,
        prenom: user.prenom,
        nbEcheances: nb,
        dateFinFenetre: dateFinStr,
      });
      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-fenetre-debut', 'Ouverture envoyée', {
      sent,
      failed,
      totalPending,
    });
    return NextResponse.json({
      success: true,
      sent,
      failed,
      totalPending,
    });
  } catch (err) {
    logger.error('cron.email-fenetre-debut', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
