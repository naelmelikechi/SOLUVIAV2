import { NextResponse } from 'next/server';
import {
  sendCdpSaturationEmail,
  sendTousCdpSaturesEmail,
} from '@/lib/email/cdp-templates';
import { computeChargeAlertes } from '@/lib/passation/charge-alertes';
import {
  ECHEANCE_COLONNE,
  echeancesDues,
  type EcheancePassation,
} from '@/lib/passation/echeances';
import { getCdpPlanDeCharge } from '@/lib/queries/cdp';
import { normalizeSnapshot } from '@/lib/queries/passation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/utils/app-url';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPE = 'cron.passation-echeances';

// CRON : rappels 18h / escalades 48h du workflow de passation (Feature 6).
// Un seul job Vercel gère les 4 échéances ; idempotence par colonne timestamp.
// AUCUN email automatique sur la passation (décision 2026-07-15) : les
// échéances notifient in-app uniquement, l'envoi du PDF par email est manuel
// (envoyerSyntheseEmail, destinataires choisis). Les alertes de saturation
// CDP (plan de charge, F7) conservent leurs emails.
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = new Date();

  const { data: docs, error } = await supabase
    .from('document_synthese')
    .select(
      'id, client_id, statut, contenu, reference_dossier, genere_par, created_at, signature_signee_at, soumise_at, rappel_dev_at, escalade_dev_at, rappel_referent_at, escalade_direction_at',
    )
    .in('statut', ['generee', 'en_cours_completion', 'en_attente_arbitrage']);
  if (error) {
    logger.error(SCOPE, 'select syntheses failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actionnables = (docs ?? [])
    .map((doc) => ({ doc, dues: echeancesDues(doc, now) }))
    .filter((d) => d.dues.length > 0);

  // Destinataires transverses (une seule requête chacun). Les emails admins
  // ne servent qu'aux alertes de saturation CDP, plus aux échéances.
  const { data: referents } = await supabase
    .from('users')
    .select('id')
    .eq('referent_cdp', true)
    .eq('actif', true);
  const { data: admins } = await supabase
    .from('users')
    .select('id, email')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  const adminIds = (admins ?? []).map((a) => a.id);
  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  const referentIds = (referents ?? []).map((r) => r.id);

  const compteurs: Record<EcheancePassation, number> = {
    rappel_dev: 0,
    escalade_dev: 0,
    rappel_referent: 0,
    escalade_direction: 0,
  };
  let failed = 0;

  for (const { doc, dues } of actionnables) {
    const snapshot = normalizeSnapshot(doc.contenu);
    const nom = snapshot.identite.raisonSociale;
    const lienApp = `/commercial/passations/${doc.id}`;

    // Le Développeur en charge : genere_par, sinon l'apporteur commercial du
    // client lié (les synthèses du pont CRM sont générées avec genere_par null).
    let devId = doc.genere_par;
    if (!devId && doc.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('apporteur_commercial_id')
        .eq('id', doc.client_id)
        .maybeSingle();
      devId = client?.apporteur_commercial_id ?? null;
    }

    for (const due of dues) {
      try {
        if (due === 'rappel_dev') {
          // devId peut etre null (ni genere_par ni apporteur_commercial_id, cas
          // anticipe plus haut). Avant, la chaine de else if etait alors
          // traversee sans rien inserer, mais le timestamp d'idempotence etait
          // pose quand meme : le rappel etait perdu DEFINITIVEMENT et le
          // compteur final mentait. On retombe sur les admins, seuls a pouvoir
          // debloquer la situation.
          const cibles = devId ? [devId] : adminIds;
          if (cibles.length === 0)
            throw new Error('aucune cible pour le rappel dev');
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const { error: notifErr } = await supabase
            .from('notifications')
            .insert(
              cibles.map((uid) => ({
                user_id: uid,
                type: 'passation_rappel' as const,
                titre: 'Synthèse de passation en attente',
                message: devId
                  ? `La synthèse de ${nom} attend vos sections 6 et 8 depuis plus de 18h (délai : 48h après signature).`
                  : `La synthèse de ${nom} attend ses sections 6 et 8 depuis plus de 18h, et aucun Développeur n'est identifié dessus.`,
                lien: lienApp,
              })),
            );
          if (notifErr) throw notifErr;
        } else if (due === 'escalade_dev') {
          const cibles = new Set([...adminIds, ...(devId ? [devId] : [])]);
          if (cibles.size === 0) throw new Error('aucune cible escalade dev');
          const { error: notifErr } = await supabase
            .from('notifications')
            .insert(
              [...cibles].map((uid) => ({
                user_id: uid,
                type: 'passation_rappel' as const,
                titre: 'Synthèse de passation en retard (48h)',
                message: `La synthèse de ${nom} n'est toujours pas soumise 48h après la signature.`,
                lien: lienApp,
              })),
            );
          if (notifErr) throw notifErr;
        } else if (due === 'rappel_referent') {
          const cibles = new Set([...referentIds, ...adminIds]);
          if (cibles.size === 0)
            throw new Error('aucune cible rappel referent');
          const { error: notifErr } = await supabase
            .from('notifications')
            .insert(
              [...cibles].map((uid) => ({
                user_id: uid,
                type: 'passation_rappel' as const,
                titre: 'Affectation CDP en attente',
                message: `La synthèse de ${nom} attend une affectation depuis plus de 18h.`,
                lien: lienApp,
              })),
            );
          if (notifErr) throw notifErr;
        } else if (due === 'escalade_direction') {
          if (adminIds.length === 0)
            throw new Error('aucun admin pour escalade direction');
          const { error: notifErr } = await supabase
            .from('notifications')
            .insert(
              adminIds.map((uid) => ({
                user_id: uid,
                type: 'passation_rappel' as const,
                titre: 'Passation sans affectation depuis 48h',
                message: `La synthèse de ${nom} n'a toujours pas de Chef de Projet affecté 48h après sa création.`,
                lien: lienApp,
              })),
            );
          if (notifErr) throw notifErr;
        }

        // L'idempotence de lib/passation/echeances.ts repose ENTIEREMENT sur ce
        // timestamp. S'il est pose alors que la notification n'est pas partie, le
        // rappel n'est jamais renvoye ; s'il n'est pas pose alors qu'elle est
        // partie, la meme notification repart 6 fois par jour ouvre. Les deux
        // erreurs etaient avalees : supabase-js ne throw pas, donc le catch
        // ci-dessous etait mort. On leve explicitement pour qu'il redevienne vif.
        const patch: Database['public']['Tables']['document_synthese']['Update'] =
          { updated_at: now.toISOString() };
        patch[ECHEANCE_COLONNE[due]] = now.toISOString();
        const { error: stampErr } = await supabase
          .from('document_synthese')
          .update(patch)
          .eq('id', doc.id);
        if (stampErr) throw stampErr;
        compteurs[due] += 1;
      } catch (err) {
        failed += 1;
        logger.error(SCOPE, 'echeance failed', {
          syntheseId: doc.id,
          due,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // --- Alertes de saturation CDP (Feature 7 §4) ---
  // Franchissements 80 % (in-app CDP + Référents) / 95 % (mail Direction),
  // idempotence par palier persisté (users.cdp_seuil_alerte), escalade
  // Direction si TOUS les CDP passent au rouge.
  const charge = { montees80: 0, montees95: 0, escalade: false };
  try {
    const [lines, { data: cdpUsers }] = await Promise.all([
      getCdpPlanDeCharge(supabase),
      supabase
        .from('users')
        .select(
          'id, nom, prenom, email, actif, cdp_disponibilite, cdp_seuil_alerte',
        )
        .or('role.eq.cdp,referent_cdp.eq.true'),
    ]);
    const byId = new Map(
      (cdpUsers ?? []).filter((u) => u.actif).map((u) => [u.id, u]),
    );
    const etats = lines
      .filter((l) => byId.has(l.cdp.id))
      .map((l) => {
        const u = byId.get(l.cdp.id)!;
        return {
          cdpId: l.cdp.id,
          ratio: l.score.ratio,
          disponibilite: u.cdp_disponibilite,
          seuilNotifie: u.cdp_seuil_alerte,
        };
      });
    const alertes = computeChargeAlertes(etats);
    const lienApp = `${getAppUrl()}/commercial/cdp`;

    await Promise.all(
      alertes.aPersister.map((t) =>
        supabase
          .from('users')
          .update({ cdp_seuil_alerte: t.seuil })
          .eq('id', t.cdpId),
      ),
    );

    for (const t of alertes.montees80) {
      const u = byId.get(t.cdpId);
      const nomCdp = u ? `${u.prenom} ${u.nom}`.trim() : '?';
      const cibles = new Set([t.cdpId, ...referentIds]);
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      await supabase.from('notifications').insert(
        [...cibles].map((uid) => ({
          user_id: uid,
          type: 'cdp_saturation' as const,
          titre: 'Charge CDP au-dessus de 80 %',
          message:
            uid === t.cdpId
              ? 'Votre charge dépasse 80 % de la saturation théorique (5 clients ou 300 alternants).'
              : `${nomCdp} dépasse 80 % de sa saturation théorique.`,
          lien: '/commercial/cdp',
        })),
      );
      charge.montees80 += 1;
    }

    for (const t of alertes.montees95) {
      const u = byId.get(t.cdpId);
      const line = lines.find((l) => l.cdp.id === t.cdpId);
      if (adminEmails.length > 0) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        await sendCdpSaturationEmail({
          to: adminEmails,
          cdpNom: u ? `${u.prenom} ${u.nom}`.trim() : '?',
          chargePct: Math.round((line?.score.ratio ?? 0) * 100),
          disponibilite: u?.cdp_disponibilite ?? null,
          lienApp,
        });
      }
      charge.montees95 += 1;
    }

    if (alertes.escaladeTousRouges && adminEmails.length > 0) {
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('archive', false)
        .is('cdp_referent_id', null);
      await sendTousCdpSaturesEmail({
        to: adminEmails,
        nbCdp: etats.length,
        nbClientsEnAttente: count ?? 0,
        lienApp,
      });
      charge.escalade = true;
    }
  } catch (err) {
    failed += 1;
    logger.error(SCOPE, 'alertes saturation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info(SCOPE, 'echeances traitees', { ...compteurs, ...charge, failed });
  return NextResponse.json({ ...compteurs, ...charge, failed });
}
