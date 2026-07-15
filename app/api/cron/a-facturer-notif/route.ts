import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { getContratsAFacturerWith } from '@/lib/queries/contrats-a-facturer';
import { formatCurrency, formatDateParis } from '@/lib/utils/formatters';

export const maxDuration = 60;

// CRON : notifie quand un contrat APPARAÎT comme facturable (une échéance
// OPCO passe due et non transmise). Destinataires : le CDP responsable du
// projet + les superadmins actifs.
//
// Idempotence : une notification par user × contrat × échéance, dédupliquée
// via le champ `lien` (fragment stable #facturable-<contratId>-<openingDate>),
// comme les crons factures-retard / echeancier-retard. Un contrat facturé
// puis dont une NOUVELLE échéance devient due plus tard porte une nouvelle
// openingDate -> nouvelle notification (voulu). Un contrat marqué non
// facturable (facturation_verrouillee) est exclu de la liste -> jamais
// notifié tant que le verrou est posé.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { rows, cdpIdByContratId } = await getContratsAFacturerWith(supabase);
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        notifications: 0,
        message: 'Aucun contrat à facturer',
      });
    }

    const { data: superadmins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'superadmin')
      .eq('actif', true);
    const superadminIds = (superadmins ?? []).map((u) => u.id);

    // Destinataires par contrat : CDP du projet + superadmins (dédupliqués :
    // un superadmin peut être le CDP du projet).
    const liens = rows.map(
      (r) => `/a-facturer#facturable-${r.contratId}-${r.openingDate}`,
    );
    const { data: existing } = await supabase
      .from('notifications')
      .select('lien, user_id')
      .eq('type', 'contrat_facturable')
      .in('lien', liens);
    const already = new Set(
      (existing ?? []).map((n) => `${n.user_id}::${n.lien}`),
    );

    const payloads: {
      type: 'contrat_facturable';
      user_id: string;
      titre: string;
      message: string;
      lien: string;
    }[] = [];
    for (const r of rows) {
      const lien = `/a-facturer#facturable-${r.contratId}-${r.openingDate}`;
      const cdpId = cdpIdByContratId.get(r.contratId);
      const destinataires = new Set<string>(superadminIds);
      if (cdpId) destinataires.add(cdpId);
      for (const userId of destinataires) {
        if (already.has(`${userId}::${lien}`)) continue;
        payloads.push({
          type: 'contrat_facturable',
          user_id: userId,
          titre: 'Contrat facturable dans Eduvia',
          message: `${r.apprenti || r.contractNumber || r.ref || 'Contrat'} (${r.projetRef ?? '-'}, ${r.opco}) : échéance du ${formatDateParis(r.openingDate)}${r.montant != null ? ` de ${formatCurrency(r.montant)}` : ''} à transmettre sur Eduvia.`,
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
        logger.error('cron.a-facturer-notif', 'insert failed', {
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

    logger.info('cron.a-facturer-notif', 'done', {
      contrats: rows.length,
      notifications: created,
    });
    return NextResponse.json({
      success: true,
      contrats: rows.length,
      notifications: created,
    });
  } catch (error) {
    logger.error('cron.a-facturer-notif', 'failed', { error });
    return NextResponse.json(
      { success: false, error: 'Erreur interne' },
      { status: 500 },
    );
  }
}
