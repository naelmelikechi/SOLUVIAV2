'use server';

import { revalidatePath } from 'next/cache';
import {
  sendAffectationCdpEmail,
  sendAffectationDevEmail,
  sendReaffectationEmail,
} from '@/lib/email/cdp-templates';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/utils/app-url';
import { isReferentCdp, isAdmin } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';
import type { DispoCdp } from '@/lib/utils/constants';

type Role = Database['public']['Enums']['role_utilisateur'];

/**
 * Résout l'utilisateur courant et son habilitation référent CDP via le client
 * RLS. Le caller décide ensuite de l'écriture (RLS ou service-role admin).
 */
async function getCdpAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      userId: null,
      role: null as Role | null,
      referentCdp: false,
    };
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role, referent_cdp, actif')
    .eq('id', user.id)
    .single();
  // Un utilisateur desactive (actif=false) perd tout pouvoir CDP meme si sa
  // session reste valide : sans ca, un referent_cdp desactive pourrait encore
  // reaffecter des clients via le client service-role (bypass RLS).
  const actif = profile?.actif ?? false;
  return {
    supabase,
    userId: user.id,
    role: (actif ? (profile?.role ?? null) : null) as Role | null,
    referentCdp: actif ? (profile?.referent_cdp ?? false) : false,
  };
}

/**
 * (Ré)affecte un client à un CDP : trace l'historique, notifie le CDP, audite.
 * L'écriture passe par le client service-role (admin) APRÈS la vérification
 * applicative isReferentCdp, pour contourner la RLS clients sans l'ouvrir.
 */
async function applyAffectation(
  clientId: string,
  cdpId: string,
  justification: string | undefined,
  requireJustification: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { userId, role, referentCdp } = await getCdpAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!isReferentCdp(role, referentCdp)) {
    return { success: false, error: 'Accès refusé' };
  }

  const justif = justification?.trim();
  if (requireJustification && !justif) {
    return { success: false, error: 'Justification requise' };
  }

  const admin = createAdminClient();

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, raison_sociale, cdp_referent_id, apporteur_commercial_id')
    .eq('id', clientId)
    .single();
  if (clientError || !client) {
    return { success: false, error: 'Client introuvable' };
  }

  const { data: cdp } = await admin
    .from('users')
    .select('id, nom, prenom, email')
    .eq('id', cdpId)
    .single();
  if (!cdp) return { success: false, error: 'CDP introuvable' };

  const fromCdpId = client.cdp_referent_id;
  if (fromCdpId === cdpId) {
    return { success: false, error: 'Ce client est déjà affecté à ce CDP' };
  }

  const { error: updateError } = await admin
    .from('clients')
    .update({
      cdp_referent_id: cdpId,
      cdp_affecte_at: new Date().toISOString(),
    })
    .eq('id', clientId);
  if (updateError) {
    logger.error('actions.cdp', 'affectation update failed', {
      clientId,
      cdpId,
      error: updateError,
    });
    return { success: false, error: "Échec de l'affectation" };
  }

  const { error: historyError } = await admin
    .from('cdp_affectation_history')
    .insert({
      client_id: clientId,
      from_cdp_id: fromCdpId,
      to_cdp_id: cdpId,
      justification: justif ?? null,
      changed_by: userId,
    });
  if (historyError) {
    logger.error('actions.cdp', 'affectation history insert failed', {
      clientId,
      cdpId,
      error: historyError,
    });
  }

  if (cdpId !== userId) {
    await admin.from('notifications').insert({
      user_id: cdpId,
      type: 'cdp_affecte',
      titre: 'Nouveau client affecté',
      message: `Le client ${client.raison_sociale} vous a été affecté.`,
      lien: '/commercial/cdp',
    });
  }

  // Vague 2 automatique (Feature 6) : l'affectation transmet la synthèse de
  // passation au CDP (variante sans section 8, consultable depuis son
  // portefeuille).
  const { data: syntheses } = await admin
    .from('document_synthese')
    .update({
      statut: 'cdp_affecte',
      diffuse_vague2_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
    .in('statut', ['generee', 'en_cours_completion', 'en_attente_arbitrage'])
    .select('id, soumise_par, genere_par');
  if (syntheses && syntheses.length > 0 && cdpId !== userId) {
    await admin.from('notifications').insert({
      user_id: cdpId,
      type: 'passation_diffusee',
      titre: 'Synthèse de passation reçue',
      message: `La synthèse de passation de ${client.raison_sociale} vous a été transmise.`,
      lien: '/commercial/cdp',
    });
  }

  // Notifications spec F6 §11 (affectation -> CDP + Développeur, mail + in-app)
  // et F7 §6 (réaffectation -> ancien CDP + Direction). Best-effort : un échec
  // d'envoi ne doit pas annuler une affectation déjà écrite.
  try {
    const cdpNom = `${cdp.prenom} ${cdp.nom}`.trim();
    const lienApp = `${getAppUrl()}/commercial/cdp`;

    if (cdp.email && cdpId !== userId) {
      await sendAffectationCdpEmail({
        to: cdp.email,
        raisonSociale: client.raison_sociale,
        lienApp,
      });
    }

    // Le Développeur en charge : apporteur du client, sinon l'auteur de la
    // synthèse (soumise_par puis genere_par).
    const devId =
      client.apporteur_commercial_id ??
      syntheses?.find((s) => s.soumise_par)?.soumise_par ??
      syntheses?.find((s) => s.genere_par)?.genere_par ??
      null;
    if (devId && devId !== cdpId && devId !== userId) {
      await admin.from('notifications').insert({
        user_id: devId,
        type: 'cdp_affecte',
        titre: 'Passation terminée',
        message: `${client.raison_sociale} a été affecté à ${cdpNom}.`,
        lien: '/commercial/cdp',
      });
      const { data: dev } = await admin
        .from('users')
        .select('email')
        .eq('id', devId)
        .maybeSingle();
      if (dev?.email) {
        await sendAffectationDevEmail({
          to: dev.email,
          raisonSociale: client.raison_sociale,
          cdpNom,
          lienApp,
        });
      }
    }

    if (fromCdpId) {
      const [{ data: ancien }, { data: admins }] = await Promise.all([
        admin
          .from('users')
          .select('nom, prenom, email')
          .eq('id', fromCdpId)
          .maybeSingle(),
        admin
          .from('users')
          .select('email')
          .in('role', ['admin', 'superadmin'])
          .eq('actif', true),
      ]);
      if (fromCdpId !== userId) {
        await admin.from('notifications').insert({
          user_id: fromCdpId,
          type: 'cdp_affecte',
          titre: 'Client réaffecté',
          message: `Le client ${client.raison_sociale} a été réaffecté à ${cdpNom}.`,
          lien: '/commercial/cdp',
        });
      }
      const destinataires = new Set(
        (admins ?? [])
          .map((a) => a.email)
          .filter((e): e is string => Boolean(e)),
      );
      if (ancien?.email) destinataires.add(ancien.email);
      if (destinataires.size > 0) {
        await sendReaffectationEmail({
          to: [...destinataires],
          raisonSociale: client.raison_sociale,
          ancienCdpNom: ancien ? `${ancien.prenom} ${ancien.nom}`.trim() : '?',
          nouveauCdpNom: cdpNom,
          justification: justif ?? null,
          lienApp,
        });
      }
    }
  } catch (err) {
    logger.error('actions.cdp', 'affectation notifications failed', {
      clientId,
      cdpId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logAudit(
    fromCdpId ? 'cdp_reaffecte' : 'cdp_affecte',
    'client',
    clientId,
    {
      from_cdp_id: fromCdpId ?? null,
      to_cdp_id: cdpId,
      justification: justif ?? null,
    },
    userId,
  );
  revalidatePath('/commercial/cdp');
  return { success: true };
}

/** Affecte un client (sans référent) à un CDP. Justification optionnelle. */
export async function affectCdp(
  clientId: string,
  cdpId: string,
  justification?: string,
): Promise<{ success: boolean; error?: string }> {
  return applyAffectation(clientId, cdpId, justification, false);
}

/**
 * Retire le CDP référent d'un client. Le client redevient "à affecter" dans
 * le panneau d'arbitrage. Les synthèses de passation déjà diffusées au CDP
 * (vague 2) restent diffusées : pas de marche arrière sur la diffusion.
 */
export async function desaffectCdp(
  clientId: string,
  justification?: string,
): Promise<{ success: boolean; error?: string }> {
  const { userId, role, referentCdp } = await getCdpAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!isReferentCdp(role, referentCdp)) {
    return { success: false, error: 'Accès refusé' };
  }

  const justif = justification?.trim();
  const admin = createAdminClient();

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, raison_sociale, cdp_referent_id')
    .eq('id', clientId)
    .single();
  if (clientError || !client) {
    return { success: false, error: 'Client introuvable' };
  }

  const fromCdpId = client.cdp_referent_id;
  if (!fromCdpId) {
    return { success: false, error: "Ce client n'a pas de CDP référent" };
  }

  const { error: updateError } = await admin
    .from('clients')
    .update({ cdp_referent_id: null, cdp_affecte_at: null })
    .eq('id', clientId);
  if (updateError) {
    logger.error('actions.cdp', 'desaffectation update failed', {
      clientId,
      fromCdpId,
      error: updateError,
    });
    return { success: false, error: 'Échec de la désaffectation' };
  }

  const { error: historyError } = await admin
    .from('cdp_affectation_history')
    .insert({
      client_id: clientId,
      from_cdp_id: fromCdpId,
      to_cdp_id: null,
      justification: justif ?? null,
      changed_by: userId,
    });
  if (historyError) {
    logger.error('actions.cdp', 'desaffectation history insert failed', {
      clientId,
      fromCdpId,
      error: historyError,
    });
  }

  if (fromCdpId !== userId) {
    await admin.from('notifications').insert({
      user_id: fromCdpId,
      type: 'cdp_affecte',
      titre: 'Client retiré de votre portefeuille',
      message: `Le client ${client.raison_sociale} ne vous est plus affecté.`,
      lien: '/commercial/cdp',
    });
  }

  logAudit(
    'cdp_desaffecte',
    'client',
    clientId,
    {
      from_cdp_id: fromCdpId,
      to_cdp_id: null,
      justification: justif ?? null,
    },
    userId,
  );
  revalidatePath('/commercial/cdp');
  return { success: true };
}

/** Le CDP courant met à jour sa propre disponibilité (users.cdp_disponibilite). */
export async function updateCdpDisponibilite(
  disponibilite: DispoCdp,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, userId, role, referentCdp } = await getCdpAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(role === 'cdp' || referentCdp === true || isAdmin(role))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { error } = await supabase
    .from('users')
    .update({ cdp_disponibilite: disponibilite })
    .eq('id', userId);
  if (error) {
    logger.error('actions.cdp', 'updateCdpDisponibilite failed', {
      userId,
      error,
    });
    return {
      success: false,
      error: 'Échec de la mise à jour de la disponibilité',
    };
  }

  logAudit(
    'cdp_disponibilite_updated',
    'user',
    userId,
    { disponibilite },
    userId,
  );
  revalidatePath('/commercial/cdp');
  return { success: true };
}
