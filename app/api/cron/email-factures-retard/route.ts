import { NextResponse } from 'next/server';
import { format, differenceInDays } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  sendFacturesRetardDigestEmail,
  type FactureRetardItem,
} from '@/lib/email/notifications';

// Weekly digest (Monday 9h Paris) of overdue invoices sent to all active admins.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  try {
    // Fetch overdue invoices + client name
    const { data: factures, error: facturesError } = await supabase
      .from('factures')
      .select(
        `
        ref, montant_ttc, date_echeance,
        client:clients!factures_client_id_fkey(raison_sociale)
      `,
      )
      .eq('statut', 'en_retard')
      .eq('est_avoir', false)
      .lt('date_echeance', todayStr)
      .order('date_echeance', { ascending: true });

    if (facturesError) {
      logger.error('cron.email-factures-retard', facturesError);
      return NextResponse.json(
        { error: facturesError.message },
        { status: 500 },
      );
    }

    if (!factures || factures.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'Aucune facture en retard',
      });
    }

    const items: FactureRetardItem[] = factures
      .filter((f) => f.ref && f.date_echeance)
      .map((f) => ({
        ref: f.ref!,
        client: f.client?.raison_sociale ?? 'Client',
        montantTtc: f.montant_ttc,
        joursRetard: differenceInDays(today, new Date(f.date_echeance!)),
      }));

    // Fetch all active admins
    const { data: admins } = await supabase
      .from('users')
      .select('email, prenom')
      .eq('role', 'admin')
      .eq('actif', true);

    if (!admins || admins.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'Aucun admin actif',
      });
    }

    let sent = 0;
    let failed = 0;

    for (const admin of admins) {
      const result = await sendFacturesRetardDigestEmail({
        to: admin.email,
        prenom: admin.prenom,
        factures: items,
      });
      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-factures-retard', 'Digest envoyé', {
      sent,
      failed,
      nbFactures: items.length,
    });
    return NextResponse.json({
      success: true,
      sent,
      failed,
      nbFactures: items.length,
    });
  } catch (err) {
    logger.error('cron.email-factures-retard', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
