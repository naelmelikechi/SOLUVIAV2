import { NextResponse } from 'next/server';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { sendRapportMensuelEmail } from '@/lib/email/notifications';

// Sent on the 1st of each month to active admins: recap of the previous month.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  const now = new Date();
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(prevStart);
  const prevStartStr = format(prevStart, 'yyyy-MM-dd');
  const prevEndStr = format(prevEnd, 'yyyy-MM-dd');
  const moisLabel = format(prevStart, 'MMMM yyyy', { locale: fr });

  try {
    const [facturesRes, paiementsRes, productionRes] = await Promise.all([
      supabase
        .from('factures')
        .select('montant_ht, statut, est_avoir, date_emission')
        .gte('date_emission', prevStartStr)
        .lte('date_emission', prevEndStr),
      supabase
        .from('paiements')
        .select('montant, date_reception')
        .gte('date_reception', prevStartStr)
        .lte('date_reception', prevEndStr),
      supabase
        .from('production_mensuelle')
        .select('production_opco, production_soluvia, mois')
        .eq('mois', prevStartStr),
    ]);

    const factures = facturesRes.data ?? [];
    const paiements = paiementsRes.data ?? [];
    const productions = productionRes.data ?? [];

    const factureHt =
      Math.round(
        factures
          .filter((f) => !f.est_avoir)
          .reduce((s, f) => s + (f.montant_ht ?? 0), 0) * 100,
      ) / 100;

    const encaisseTtc =
      Math.round(paiements.reduce((s, p) => s + (p.montant ?? 0), 0) * 100) /
      100;

    const productionHt =
      Math.round(
        productions.reduce(
          (s, p) => s + (p.production_opco ?? 0) + (p.production_soluvia ?? 0),
          0,
        ) * 100,
      ) / 100;

    const nbFacturesEmises = factures.filter((f) => !f.est_avoir).length;
    const nbFacturesRetard = factures.filter(
      (f) => f.statut === 'en_retard',
    ).length;

    const kpis = {
      moisPrecedent: moisLabel,
      productionHt,
      factureHt,
      encaisseTtc,
      nbFacturesEmises,
      nbFacturesRetard,
    };

    // Recipients: active admins
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
      const result = await sendRapportMensuelEmail({
        to: admin.email,
        prenom: admin.prenom,
        kpis,
      });
      if (result.success) sent++;
      else failed++;
    }

    logger.info('cron.email-rapport-mensuel', 'Rapport envoyé', {
      sent,
      failed,
      mois: moisLabel,
    });

    return NextResponse.json({ success: true, sent, failed, kpis });
  } catch (err) {
    logger.error('cron.email-rapport-mensuel', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
