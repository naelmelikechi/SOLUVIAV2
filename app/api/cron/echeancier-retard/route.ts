import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import {
  getEcheancierDuesWith,
  currentMoisCutoff,
} from '@/lib/queries/echeancier-dues';
import { formatMoisConcerne, formatCurrency } from '@/lib/utils/formatters';

export const maxDuration = 60;

// CRON : notifie les admins quand une échéance du modèle échéancier passe
// "en retard" (mois du jalon revolu sans facture qui le couvre). Le calcul
// est le même que l'onglet Échéancier (getEcheancierDues) ; ici on ne
// retient que les mois STRICTEMENT antérieurs au mois courant.
//
// Idempotence : une notification par admin × projet × mois, dedupliquée via
// le champ `lien` (fragment stable #echeancier-<ref>-<mois>), comme le cron
// factures-retard. Une échéance facturée disparaît du calcul : aucune
// notification parasite les jours suivants.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { dues } = await getEcheancierDuesWith(supabase);
    const cutoff = currentMoisCutoff();
    const enRetard = dues.filter((d) => d.moisConcerne < cutoff);

    if (enRetard.length === 0) {
      return NextResponse.json({
        success: true,
        notifications: 0,
        message: 'Aucune échéance en retard',
      });
    }

    // Destinataires : admins/superadmins actifs (la facturation est admin-only).
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'superadmin'])
      .eq('actif', true);
    if (!admins || admins.length === 0) {
      return NextResponse.json({
        success: true,
        notifications: 0,
        message: 'Aucun admin actif',
      });
    }

    const liens = enRetard.map(
      (d) => `/facturation#echeancier-${d.projetRef}-${d.moisConcerne}`,
    );
    const { data: existing } = await supabase
      .from('notifications')
      .select('lien, user_id')
      .eq('type', 'periode_facturation')
      .in('lien', liens);
    const already = new Set(
      (existing ?? []).map((n) => `${n.user_id}::${n.lien}`),
    );

    const payloads: {
      type: 'periode_facturation';
      user_id: string;
      titre: string;
      message: string;
      lien: string;
    }[] = [];
    for (const due of enRetard) {
      const lien = `/facturation#echeancier-${due.projetRef}-${due.moisConcerne}`;
      for (const admin of admins) {
        if (already.has(`${admin.id}::${lien}`)) continue;
        payloads.push({
          type: 'periode_facturation',
          user_id: admin.id,
          titre: 'Échéance de facturation en retard',
          message: `${due.projetRef} (${due.clientRaisonSociale}) : l'échéance de ${formatMoisConcerne(due.moisConcerne)} (${formatCurrency(due.montantHt)} HT) n'a pas encore été facturée.`,
          lien,
        });
      }
    }

    let created = 0;
    if (payloads.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(payloads);
      if (insertError) {
        logger.error('cron.echeancier-retard', 'insert notifications failed', {
          error: insertError,
          count: payloads.length,
        });
        return NextResponse.json(
          { success: false, error: insertError.message },
          { status: 500 },
        );
      }
      created = payloads.length;
    }

    logger.info('cron.echeancier-retard', 'done', {
      enRetard: enRetard.length,
      notifications: created,
    });
    return NextResponse.json({
      success: true,
      enRetard: enRetard.length,
      notifications: created,
    });
  } catch (err) {
    logger.error('cron.echeancier-retard', 'unexpected failure', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: 'Erreur interne' },
      { status: 500 },
    );
  }
}
