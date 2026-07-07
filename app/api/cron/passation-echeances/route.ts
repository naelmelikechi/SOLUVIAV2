import { NextResponse } from 'next/server';
import {
  sendPassationEscaladeDevEmail,
  sendPassationEscaladeDirectionEmail,
  sendPassationRappelReferentEmail,
} from '@/lib/email/passation-templates';
import {
  ECHEANCE_COLONNE,
  echeancesDues,
  type EcheancePassation,
} from '@/lib/passation/echeances';
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
// Volontairement séparé de prospect-alertes (supprimé avec les prospects en
// Phase 2 CRM alors que la passation survit).
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const now = new Date();

  const { data: docs, error } = await supabase
    .from('document_synthese')
    .select(
      'id, prospect_id, client_id, statut, contenu, reference_dossier, genere_par, created_at, signature_signee_at, soumise_at, rappel_dev_at, escalade_dev_at, rappel_referent_at, escalade_direction_at',
    )
    .in('statut', ['generee', 'en_cours_completion', 'en_attente_arbitrage']);
  if (error) {
    logger.error(SCOPE, 'select syntheses failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actionnables = (docs ?? [])
    .map((doc) => ({ doc, dues: echeancesDues(doc, now) }))
    .filter((d) => d.dues.length > 0);
  if (actionnables.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Destinataires transverses (une seule requête chacun).
  const { data: referents } = await supabase
    .from('users')
    .select('id, email')
    .eq('referent_cdp', true)
    .eq('actif', true);
  const { data: admins } = await supabase
    .from('users')
    .select('id, email')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  const referentIds = (referents ?? []).map((r) => r.id);
  const referentEmails = (referents ?? [])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

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
    const ref = doc.reference_dossier ?? snapshot.meta.referenceDossier;
    const lienApp = doc.prospect_id
      ? `/commercial/prospects/${doc.prospect_id}`
      : '/commercial/cdp';
    const lienFiche = `${getAppUrl()}${lienApp}`;

    // Le Développeur en charge : genere_par, sinon le commercial du prospect.
    let devId = doc.genere_par;
    if (!devId && doc.prospect_id) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('commercial_id')
        .eq('id', doc.prospect_id)
        .maybeSingle();
      devId = prospect?.commercial_id ?? null;
    }

    for (const due of dues) {
      try {
        if (due === 'rappel_dev' && devId) {
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          await supabase.from('notifications').insert({
            user_id: devId,
            type: 'passation_rappel',
            titre: 'Synthèse de passation en attente',
            message: `La synthèse de ${nom} attend vos sections 6 et 8 depuis plus de 18h (délai : 48h après signature).`,
            lien: lienApp,
          });
        } else if (due === 'escalade_dev') {
          const emails = new Set(adminEmails);
          if (devId) {
            const { data: dev } = await supabase
              .from('users')
              .select('email')
              .eq('id', devId)
              .maybeSingle();
            if (dev?.email) emails.add(dev.email);
          }
          if (emails.size > 0) {
            await sendPassationEscaladeDevEmail({
              to: [...emails],
              prospectNom: nom,
              referenceDossier: ref,
              lienFiche,
            });
          }
        } else if (due === 'rappel_referent') {
          const emails = new Set([...referentEmails, ...adminEmails]);
          if (emails.size > 0) {
            await sendPassationRappelReferentEmail({
              to: [...emails],
              raisonSociale: nom,
              referenceDossier: ref,
              lienFiche,
            });
          }
          if (referentIds.length > 0) {
            await supabase.from('notifications').insert(
              referentIds.map((uid) => ({
                user_id: uid,
                type: 'passation_rappel' as const,
                titre: 'Affectation CDP en attente',
                message: `La synthèse de ${nom} attend une affectation depuis plus de 18h.`,
                lien: lienApp,
              })),
            );
          }
        } else if (due === 'escalade_direction') {
          if (adminEmails.length > 0) {
            await sendPassationEscaladeDirectionEmail({
              to: adminEmails,
              raisonSociale: nom,
              referenceDossier: ref,
              lienFiche,
            });
          }
        }

        const patch: Database['public']['Tables']['document_synthese']['Update'] =
          { updated_at: now.toISOString() };
        patch[ECHEANCE_COLONNE[due]] = now.toISOString();
        await supabase.from('document_synthese').update(patch).eq('id', doc.id);
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

  logger.info(SCOPE, 'echeances traitees', { ...compteurs, failed });
  return NextResponse.json({ ...compteurs, failed });
}
