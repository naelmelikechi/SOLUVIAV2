import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { format } from 'date-fns';

export const maxDuration = 60;

// CRON: Mark overdue invoices as en_retard + create notifications
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  try {
    // 1. Find factures that are emise and past due date.
    // Skip est_avoir : un avoir ne se paie pas, donc jamais "en retard"
    // - notification parasite sinon (cf. FAC-HED-0002 flag a tort).
    const { data: overdueFactures, error: fetchError } = await supabase
      .from('factures')
      .select(
        `
        id, ref, date_echeance,
        projet:projets!factures_projet_id_fkey(cdp_id)
      `,
      )
      .eq('statut', 'emise')
      .eq('est_avoir', false)
      .lt('date_echeance', today);

    if (fetchError) {
      logger.error('cron.factures-retard', fetchError);
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 },
      );
    }

    if (!overdueFactures || overdueFactures.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        notifications: 0,
        message: 'Aucune facture en retard',
      });
    }

    // 2. Update all overdue factures to en_retard
    const factureIds = overdueFactures.map((f) => f.id);
    const { error: updateError } = await supabase
      .from('factures')
      .update({ statut: 'en_retard' })
      .in('id', factureIds);

    if (updateError) {
      logger.error('cron.factures-retard', updateError, { factureIds });
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    // 3. Create notifications (idempotent: skip if one already exists).
    //    Avant : N+1 query (1 SELECT count par facture). Maintenant : 1 SELECT
    //    pre-fetch toutes les notifs facture_retard existantes pour les liens
    //    concernes, puis lookup dans un Set.
    let notificationsCreated = 0;

    const candidateLinks = overdueFactures
      .map((f) => (f.ref ? `/facturation/${f.ref}` : null))
      .filter((l): l is string => l !== null);

    const existingLinks = new Set<string>();
    if (candidateLinks.length > 0) {
      const { data: existingNotifs } = await supabase
        .from('notifications')
        .select('lien')
        .eq('type', 'facture_retard')
        .in('lien', candidateLinks);
      for (const n of existingNotifs ?? []) {
        if (n.lien) existingLinks.add(n.lien);
      }
    }

    for (const facture of overdueFactures) {
      const cdpId = facture.projet?.cdp_id;
      if (!cdpId || !facture.ref) continue;

      const lien = `/facturation/${facture.ref}`;
      if (existingLinks.has(lien)) continue;

      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          type: 'facture_retard',
          user_id: cdpId,
          titre: 'Facture en retard',
          message: `La facture ${facture.ref} est en retard de paiement depuis le ${facture.date_echeance}`,
          lien,
        });

      if (!notifError) {
        notificationsCreated++;
      } else {
        logger.warn(
          'cron.factures-retard',
          `Failed to create notification for ${facture.ref}`,
          {
            error: notifError,
          },
        );
      }
    }

    logger.info(
      'cron.factures-retard',
      `Marked ${factureIds.length} factures en retard`,
      {
        updated: factureIds.length,
        notifications: notificationsCreated,
      },
    );

    return NextResponse.json({
      success: true,
      updated: factureIds.length,
      notifications: notificationsCreated,
    });
  } catch (err) {
    logger.error('cron.factures-retard', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
