import { NextResponse } from 'next/server';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import {
  ALERTE_SANTE_COLONNE,
  alertesSanteDues,
  derniereActivite,
  type AlerteSante,
} from '@/lib/crm/domain/sante';
import { sendSanteOpportuniteEmail } from '@/lib/email/crm-alertes-templates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/utils/app-url';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/lib/crm/database.types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPE = 'cron.crm-alertes';

// CRON : alertes santé des opportunités CRM (spec Feature 1 §5 adaptée) :
// - > 14 j sans activité : notification in-app crm.notifications au owner ;
// - > 30 j sans activité : mail au owner + à la Direction (admins).
// Idempotence par colonnes alerte_sante_14_at / alerte_sante_30_at, ré-armées
// dès qu'une activité (activité, RDV, update) est plus récente que l'alerte.
// Remplace le cron prospect-alertes, supprimé avec les prospects (Phase 2 CRM).
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const crm = createCrmAdminClient();
  const now = new Date();

  const { data: opps, error } = await crm
    .from('opportunites')
    .select(
      'id, intitule, compte_id, owner_id, statut, updated_at, alerte_sante_14_at, alerte_sante_30_at',
    )
    .eq('statut', 'ouverte');
  if (error) {
    logger.error(SCOPE, 'select opportunites failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!opps || opps.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Timestamps d'activité par opportunité : dernières crm.activites + RDV
  // planifiés/réalisés (un RDV futur planifié = opportunité saine).
  const ids = opps.map((o) => o.id);
  const [{ data: activites }, { data: rdvs }] = await Promise.all([
    crm
      .from('activites')
      .select('opportunite_id, created_at')
      .in('opportunite_id', ids),
    crm
      .from('rdv')
      .select('opportunite_id, debut, created_at')
      .in('opportunite_id', ids)
      .in('statut', ['planifie', 'realise']),
  ]);
  const parOpp = new Map<string, string[]>();
  const push = (oppId: string | null, ts: string | null) => {
    if (!oppId || !ts) return;
    const arr = parOpp.get(oppId);
    if (arr) arr.push(ts);
    else parOpp.set(oppId, [ts]);
  };
  for (const a of activites ?? []) push(a.opportunite_id, a.created_at);
  for (const r of rdvs ?? []) {
    push(r.opportunite_id, r.created_at);
    push(r.opportunite_id, r.debut);
  }

  const actionnables = opps
    .map((opp) => ({
      opp,
      dues: alertesSanteDues(opp, parOpp.get(opp.id) ?? [], now),
    }))
    .filter((a) => a.dues.length > 0);
  if (actionnables.length === 0) {
    return NextResponse.json({ processed: 0, sante_14: 0, sante_30: 0 });
  }

  // Référentiels transverses (une requête chacun) : comptes, owners, Direction.
  const pub = createAdminClient();
  const compteIds = [...new Set(actionnables.map((a) => a.opp.compte_id))];
  const ownerIds = [
    ...new Set(
      actionnables
        .map((a) => a.opp.owner_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const [{ data: comptes }, { data: owners }, { data: admins }] =
    await Promise.all([
      crm.from('comptes').select('id, nom').in('id', compteIds),
      ownerIds.length > 0
        ? pub.from('users').select('id, email, prenom, nom').in('id', ownerIds)
        : Promise.resolve({ data: [] as never[] }),
      pub
        .from('users')
        .select('id, email')
        .in('role', ['admin', 'superadmin'])
        .eq('actif', true),
    ]);
  const compteNom = new Map((comptes ?? []).map((c) => [c.id, c.nom]));
  const ownerById = new Map((owners ?? []).map((u) => [u.id, u]));
  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));

  const compteurs: Record<AlerteSante, number> = { sante_14: 0, sante_30: 0 };
  let failed = 0;

  for (const { opp, dues } of actionnables) {
    const derniere = derniereActivite(opp, parOpp.get(opp.id) ?? []);
    const joursInactif = Math.floor((now.getTime() - derniere) / 86_400_000);
    const owner = opp.owner_id ? ownerById.get(opp.owner_id) : undefined;
    const ownerNom =
      [owner?.prenom, owner?.nom].filter(Boolean).join(' ').trim() ||
      owner?.email ||
      null;

    for (const due of dues) {
      try {
        if (due === 'sante_14') {
          if (opp.owner_id) {
            // oxlint-disable-next-line react-doctor/async-await-in-loop
            const { error: notifErr } = await crm.from('notifications').insert({
              user_id: opp.owner_id,
              actor_id: null,
              type: 'sante_opportunite',
              contenu: `${opp.intitule} est sans activité depuis ${joursInactif} jours. Relancez le dossier ou actez sa clôture.`,
              link: '/crm/pipeline',
            });
            if (notifErr) throw new Error(notifErr.message);
          }
        } else {
          const emails = new Set(adminEmails);
          if (owner?.email) emails.add(owner.email);
          if (emails.size > 0) {
            const res = await sendSanteOpportuniteEmail({
              to: [...emails],
              compte: compteNom.get(opp.compte_id) ?? null,
              opportunite: opp.intitule,
              owner: ownerNom,
              joursInactif,
              lienPipeline: `${getAppUrl()}/crm/pipeline`,
            });
            if (!res.success && !res.skipped) {
              throw new Error(res.error ?? 'envoi email échoué');
            }
          }
        }

        // Pose du timestamp d'idempotence (le trigger opportunites_updated
        // ignore ces colonnes : updated_at n'est PAS bumpé).
        const patch: Database['crm']['Tables']['opportunites']['Update'] = {};
        patch[ALERTE_SANTE_COLONNE[due]] = now.toISOString();
        const { error: updErr } = await crm
          .from('opportunites')
          .update(patch)
          .eq('id', opp.id);
        if (updErr) throw new Error(updErr.message);
        compteurs[due] += 1;
      } catch (err) {
        failed += 1;
        logger.error(SCOPE, 'alerte sante failed', {
          oppId: opp.id,
          due,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info(SCOPE, 'alertes sante traitees', { ...compteurs, failed });
  return NextResponse.json({
    processed: actionnables.length,
    ...compteurs,
    failed,
  });
}
