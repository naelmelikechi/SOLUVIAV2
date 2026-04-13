import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { format } from 'date-fns';

// CRON: Mark overdue invoices as en_retard + create notifications
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  try {
    // 1. Find factures that are emise and past due date
    const { data: overdueFactures, error: fetchError } = await supabase
      .from('factures')
      .select(
        `
        id, ref, date_echeance,
        projet:projets!factures_projet_id_fkey(cdp_id)
      `,
      )
      .eq('statut', 'emise')
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

    // 3. Create notifications (idempotent: skip if one already exists for that facture)
    let notificationsCreated = 0;

    for (const facture of overdueFactures) {
      const cdpId = facture.projet?.cdp_id;
      if (!cdpId || !facture.ref) continue;

      // Check if notification already exists for this facture (idempotent)
      const { count: existingCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', cdpId)
        .eq('type', 'facture_retard')
        .eq('lien', `/facturation/${facture.ref}`);

      if (existingCount && existingCount > 0) continue;

      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          type: 'facture_retard',
          user_id: cdpId,
          titre: 'Facture en retard',
          message: `La facture ${facture.ref} est en retard de paiement depuis le ${facture.date_echeance}`,
          lien: `/facturation/${facture.ref}`,
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
