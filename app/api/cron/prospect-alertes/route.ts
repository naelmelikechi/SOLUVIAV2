import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TypeAlerte = 'prospect_rdv_sans_mail' | 'prospect_sans_activite';

interface NotifInsert {
  type: TypeAlerte;
  user_id: string;
  titre: string;
  message: string;
  lien: string;
}

const DAY_MS = 86_400_000;

// CRON quotidien : alertes commerciales in-app.
// (a) RDV tenu sans mail post-RDV : commercial à +24h, escalade admins à +48h.
// (b) Prospect actif sans activité : commercial à +14j, escalade admins à +30j.
// Dédup par (type, user_id, lien) sur les notifications NON LUES -> idempotent.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = Date.now();
  const oneDayAgo = new Date(now - DAY_MS);
  const twoDaysAgo = new Date(now - 2 * DAY_MS);
  const fourteenDaysAgo = new Date(now - 14 * DAY_MS);
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS);

  // Admins actifs (destinataires des escalades) chargés une seule fois.
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  const adminIds = (admins ?? []).map((a) => a.id);

  const pending: NotifInsert[] = [];

  // (a) RDV tenus sans mail post-RDV depuis >= 24h.
  const { data: rdvs, error: rdvErr } = await supabase
    .from('rdv_commerciaux')
    .select(
      'id, commercial_id, date_realisee, prospect:prospects!rdv_commerciaux_prospect_id_fkey(id, nom, commercial_id)',
    )
    .eq('statut', 'realise')
    .is('mail_post_envoye_at', null)
    .lte('date_realisee', oneDayAgo.toISOString());
  if (rdvErr) {
    logger.error('cron.prospect-alertes', 'lecture rdv KO', { error: rdvErr });
    return NextResponse.json({ error: rdvErr.message }, { status: 500 });
  }

  for (const rdv of rdvs ?? []) {
    const prospect = rdv.prospect;
    if (!prospect || !rdv.date_realisee) continue;
    const lien = `/commercial/prospects/${prospect.id}`;
    const cible = prospect.commercial_id ?? rdv.commercial_id;
    const escalade =
      new Date(rdv.date_realisee).getTime() <= twoDaysAgo.getTime();

    if (cible) {
      pending.push({
        type: 'prospect_rdv_sans_mail',
        user_id: cible,
        titre: 'Mail post-RDV en attente',
        message: `Le mail post-RDV pour ${prospect.nom} n'a pas été envoyé depuis plus de 24h.`,
        lien,
      });
    }
    if (escalade) {
      for (const adminId of adminIds) {
        pending.push({
          type: 'prospect_rdv_sans_mail',
          user_id: adminId,
          titre: 'Mail post-RDV en attente (escalade)',
          message: `Le mail post-RDV pour ${prospect.nom} n'a toujours pas été envoyé depuis plus de 48h.`,
          lien,
        });
      }
    }
  }

  // (b) Prospects actifs (non archivés, non signés) sans action depuis >= 14j.
  const { data: prospects, error: prospErr } = await supabase
    .from('prospects')
    .select('id, nom, commercial_id, derniere_action_at')
    .eq('archive', false)
    .neq('stage', 'signe')
    .lte('derniere_action_at', fourteenDaysAgo.toISOString());
  if (prospErr) {
    logger.error('cron.prospect-alertes', 'lecture prospects KO', {
      error: prospErr,
    });
    return NextResponse.json({ error: prospErr.message }, { status: 500 });
  }

  for (const p of prospects ?? []) {
    const lien = `/commercial/prospects/${p.id}`;
    const escalade =
      new Date(p.derniere_action_at).getTime() <= thirtyDaysAgo.getTime();

    if (p.commercial_id) {
      pending.push({
        type: 'prospect_sans_activite',
        user_id: p.commercial_id,
        titre: 'Prospect sans activité',
        message: `Aucune action sur ${p.nom} depuis plus de 14 jours.`,
        lien,
      });
    }
    if (escalade) {
      for (const adminId of adminIds) {
        pending.push({
          type: 'prospect_sans_activite',
          user_id: adminId,
          titre: 'Prospect sans activité (escalade)',
          message: `Aucune action sur ${p.nom} depuis plus de 30 jours.`,
          lien,
        });
      }
    }
  }

  // Dédup : on ne réinsère pas une notification identique (même type + même
  // destinataire + même lien) tant qu'elle n'a pas été lue. Pré-fetch unique.
  const candidateLinks = [...new Set(pending.map((n) => n.lien))];
  const existingKeys = new Set<string>();
  if (candidateLinks.length > 0) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('type, user_id, lien')
      .in('type', ['prospect_rdv_sans_mail', 'prospect_sans_activite'])
      .in('lien', candidateLinks)
      .is('read_at', null);
    for (const n of existing ?? []) {
      existingKeys.add(`${n.type}|${n.user_id}|${n.lien ?? ''}`);
    }
  }

  const seen = new Set<string>();
  const toInsert = pending.filter((n) => {
    const key = `${n.type}|${n.user_id}|${n.lien}`;
    if (existingKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let notificationsCreated = 0;
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('notifications')
      .insert(toInsert);
    if (insertErr) {
      logger.error('cron.prospect-alertes', 'insert notifications KO', {
        error: insertErr,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    notificationsCreated = toInsert.length;
  }

  const rdvCount = rdvs?.length ?? 0;
  const prospectCount = prospects?.length ?? 0;
  logger.info('cron.prospect-alertes', 'alertes émises', {
    rdvSansMail: rdvCount,
    prospectsSansActivite: prospectCount,
    notificationsCreated,
  });

  return NextResponse.json({
    success: true,
    rdvSansMail: rdvCount,
    prospectsSansActivite: prospectCount,
    notificationsCreated,
  });
}
