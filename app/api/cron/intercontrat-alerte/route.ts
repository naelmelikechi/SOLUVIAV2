import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';
import { tryAcquireEmailLock, isoWeekKey } from '@/lib/email/send-log';
import { deriveCollabStatus } from '@/lib/utils/collab-status';

export const maxDuration = 60;

const ANCIENNETE_SEUIL_JOURS = 14;
const SCOPE = 'cron.intercontrat-alerte';

/**
 * Cron hebdo (lundi 9h Paris) : pour chaque collaborateur en intercontrat
 * depuis plus de 14 jours, fan-out une notification d alerte aux admins.
 *
 * Reuse le type 'collaborateur_a_affecter' : la notif sera auto-resolue
 * (trigger SQL) des que le user recevra un projet client. Anti-doublon
 * hebdo via email_send_log keyed par ISO week.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date();

  const lockAcquired = await tryAcquireEmailLock(
    supabase,
    'cron-intercontrat-alerte',
    isoWeekKey(today),
  );
  if (!lockAcquired) {
    return NextResponse.json({ success: true, skipped: 'already_sent' });
  }

  try {
    // 1. Identifie les unassigned actifs (CDP sans pipeline_access ni projet client)
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, nom, prenom, role, pipeline_access, created_at, actif')
      .eq('actif', true);

    if (usersError) {
      logger.error(SCOPE, 'fetch users failed', { error: usersError });
      return NextResponse.json(
        { error: 'fetch users failed' },
        { status: 500 },
      );
    }

    const { data: projetsData, error: projetsError } = await supabase
      .from('projets')
      .select('cdp_id, backup_cdp_id')
      .eq('archive', false)
      .eq('est_interne', false);

    if (projetsError) {
      logger.error(SCOPE, 'fetch projets failed', { error: projetsError });
      return NextResponse.json(
        { error: 'fetch projets failed' },
        { status: 500 },
      );
    }

    const projetsCount = new Map<string, number>();
    for (const p of projetsData ?? []) {
      if (p.cdp_id) {
        projetsCount.set(p.cdp_id, (projetsCount.get(p.cdp_id) ?? 0) + 1);
      }
      if (p.backup_cdp_id) {
        projetsCount.set(
          p.backup_cdp_id,
          (projetsCount.get(p.backup_cdp_id) ?? 0) + 1,
        );
      }
    }

    const seuilMs = ANCIENNETE_SEUIL_JOURS * 24 * 60 * 60 * 1000;
    const now = today.getTime();

    const aAlerter = (usersData ?? []).filter((u) => {
      const status = deriveCollabStatus(
        u.role,
        u.pipeline_access ?? false,
        projetsCount.get(u.id) ?? 0,
      );
      if (status !== 'unassigned_collaborator') return false;
      const created = new Date(u.created_at).getTime();
      return now - created >= seuilMs;
    });

    if (aAlerter.length === 0) {
      return NextResponse.json({ success: true, sent: 0, alerted: 0 });
    }

    // 2. Liste des admins actifs (destinataires des notifs)
    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'superadmin'])
      .eq('actif', true);

    if (adminsError) {
      logger.error(SCOPE, 'fetch admins failed', { error: adminsError });
      return NextResponse.json(
        { error: 'fetch admins failed' },
        { status: 500 },
      );
    }

    if (!admins || admins.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        alerted: aAlerter.length,
        warning: 'no_active_admin',
      });
    }

    // 3. Fan-out : une notif par (admin, user en intercontrat)
    const notifs = aAlerter.flatMap((u) => {
      const created = new Date(u.created_at).getTime();
      const jours = Math.floor((now - created) / (24 * 60 * 60 * 1000));
      const fullName =
        `${u.prenom ?? ''} ${u.nom ?? ''}`.trim() || 'Un collaborateur';
      return admins.map((a) => ({
        user_id: a.id,
        subject_user_id: u.id,
        type: 'collaborateur_a_affecter' as const,
        titre: 'Collaborateur en intercontrat',
        message: `${fullName} est en attente d affectation depuis ${jours} jours.`,
        lien: '/admin/intercontrat',
      }));
    });

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifs);

    if (insertError) {
      logger.error(SCOPE, 'insert notifications failed', {
        error: insertError,
      });
      return NextResponse.json({ error: 'insert failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alerted: aAlerter.length,
      sent: notifs.length,
    });
  } catch (e) {
    logger.error(SCOPE, 'unexpected error', { error: e });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
