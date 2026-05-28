import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendFenetreDebutEmail } from '@/lib/email/notifications';
import { FENETRE_FACTURATION_FIN } from '@/lib/utils/constants';
import { withEmailLock } from '@/lib/email/send-log';

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
  try {
    const result = await withEmailLock(
      supabase,
      'email-fenetre-debut',
      format(dateFinFenetre, 'yyyy-MM'),
      async () => {
        // Echeances pending + users actifs en parallele.
        const [echeancesRes, usersRes] = await Promise.all([
          supabase
            .from('echeances')
            .select(
              `
        id,
        projet:projets!echeances_projet_id_fkey(cdp_id, backup_cdp_id)
      `,
            )
            .is('facture_id', null)
            .eq('validee', false),
          supabase
            .from('users')
            .select('id, email, prenom, role')
            .eq('actif', true)
            .in('role', ['admin', 'superadmin', 'cdp']),
        ]);

        const { data: echeances, error: echError } = echeancesRes;
        if (echError) throw new Error(echError.message);

        const countByCdp = new Map<string, number>();
        for (const ech of echeances ?? []) {
          const cdpId = ech.projet?.cdp_id;
          if (!cdpId) continue;
          countByCdp.set(cdpId, (countByCdp.get(cdpId) ?? 0) + 1);
        }

        const { data: users } = usersRes;
        if (!users || users.length === 0) {
          return { sent: 0 };
        }

        const totalPending = echeances?.length ?? 0;

        let sent = 0;
        let failed = 0;

        for (const user of users) {
          const nb =
            user.role === 'admin' || user.role === 'superadmin'
              ? totalPending
              : (countByCdp.get(user.id) ?? 0);

          // CDP with no pending echeances: skip; admin always gets the digest
          if (user.role === 'cdp' && nb === 0) continue;

          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const r = await sendFenetreDebutEmail({
            to: user.email,
            prenom: user.prenom,
            nbEcheances: nb,
            dateFinFenetre: dateFinStr,
          });
          if (r.success) sent++;
          else failed++;
        }

        logger.info('cron.email-fenetre-debut', 'Ouverture envoyée', {
          sent,
          failed,
          totalPending,
        });
        return { sent, failed, totalPending };
      },
    );

    if (result === null) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 'already_sent',
      });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error('cron.email-fenetre-debut', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
