'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthWithPipeline } from '@/lib/auth/guards';
import { sendSyntheseVague1Email } from '@/lib/email/passation-templates';
import { genererSyntheseCore, regenerer } from '@/lib/passation/core';
import {
  getRecoBySynthese,
  getSyntheseByProspect,
  normalizeSnapshot,
  saisiesOf,
} from '@/lib/queries/passation';
import type { PassationReco, PassationSynthese } from '@/lib/queries/passation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/utils/app-url';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { renderSynthesePdf } from '@/lib/utils/synthese-pdf';

const BUCKET = 'passation-documents';
const uuidSchema = z.string().uuid();

/**
 * Génère la synthèse de passation (bouton fiche prospect). Idempotent : si
 * elle existe déjà, régénère le snapshot (saisies 6/8 conservées, PDFs
 * invalidés).
 */
export async function genererSynthese(
  prospectId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!uuidSchema.safeParse(prospectId).success) {
    return { success: false, error: 'Prospect invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: prospect } = await supabase
    .from('prospects')
    .select('stage, client_id')
    .eq('id', prospectId)
    .single();
  if (!prospect) return { success: false, error: 'Prospect introuvable' };
  // La synthèse de passation n'a de sens qu'après la signature du contrat.
  if (!(prospect.stage === 'signe' || prospect.client_id != null)) {
    return {
      success: false,
      error: 'Le prospect doit être signé pour générer la synthèse',
    };
  }

  const existing = await getSyntheseByProspect(prospectId);
  const result = existing?.id
    ? await regenerer(supabase, prospectId, { generePar: userId }, existing.id)
    : await genererSyntheseCore(supabase, prospectId, { generePar: userId });
  if (result.error || !result.id) {
    return {
      success: false,
      error: result.error ?? 'Échec de la génération',
    };
  }

  revalidatePath(`/commercial/prospects/${prospectId}`);
  return { success: true, id: result.id };
}

const SaisiesSchema = z.object({
  points_vigilance: z.string().trim().max(4000).nullable(),
  promesses_orales: z.string().trim().max(4000).nullable(),
  typologie_client: z
    .enum(['exigeant', 'collaboratif', 'autonome', 'accompagnement_fort'])
    .nullable(),
  charge_previsionnelle: z.enum(['faible', 'moyenne', 'forte']).nullable(),
  risque_churn: z.enum(['faible', 'moyen', 'fort']).nullable(),
  cdp_ideal: z.string().trim().max(4000).nullable(),
  cdp_a_eviter: z.string().trim().max(4000).nullable(),
  notes_inter_equipe: z.string().trim().max(4000).nullable(),
});

export type SaisiesSynthese = z.infer<typeof SaisiesSchema>;

/**
 * Enregistre les saisies du Développeur : section 6 sur document_synthese,
 * section 8 sur document_synthese_reco (jamais lisible par le CDP affecté).
 */
export async function enregistrerSaisiesSynthese(
  syntheseId: string,
  saisies: SaisiesSynthese,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { success: false, error: 'Synthèse invalide' };
  }
  const parsed = SaisiesSchema.safeParse(saisies);
  if (!parsed.success) {
    return { success: false, error: 'Saisies invalides' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('id, prospect_id, statut')
    .eq('id', syntheseId)
    .single();
  if (!synthese) return { success: false, error: 'Synthèse inconnue' };

  const d = parsed.data;
  const vide = (s: string | null) => (s === '' ? null : s);
  const { error } = await supabase
    .from('document_synthese')
    .update({
      points_vigilance: vide(d.points_vigilance),
      promesses_orales: vide(d.promesses_orales),
      // Le Dev a ouvert et travaillé le document.
      ...(synthese.statut === 'generee'
        ? { statut: 'en_cours_completion' as const }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syntheseId);
  if (error) return { success: false, error: error.message };

  const { error: recoError } = await supabase
    .from('document_synthese_reco')
    .upsert(
      {
        synthese_id: syntheseId,
        typologie_client: d.typologie_client,
        charge_previsionnelle: d.charge_previsionnelle,
        risque_churn: d.risque_churn,
        cdp_ideal: vide(d.cdp_ideal),
        cdp_a_eviter: vide(d.cdp_a_eviter),
        notes_inter_equipe: vide(d.notes_inter_equipe),
      },
      { onConflict: 'synthese_id' },
    );
  if (recoError) return { success: false, error: recoError.message };

  logAudit(
    'synthese_saisies',
    'document_synthese',
    syntheseId,
    undefined,
    userId,
  );
  if (synthese.prospect_id) {
    revalidatePath(`/commercial/prospects/${synthese.prospect_id}`);
  }
  return { success: true };
}

/**
 * Soumet la synthèse au Référent CDP (Vague 1) : rend les 2 PDFs depuis le
 * snapshot figé + saisies, les dépose dans le bucket, passe le statut à
 * 'en_attente_arbitrage' et envoie le mail (PDF complet en pièce jointe) aux
 * Référents CDP + Direction, avec notification in-app.
 */
export async function soumettreSynthese(
  syntheseId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { success: false, error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('*')
    .eq('id', syntheseId)
    .single<PassationSynthese>();
  if (!synthese) return { success: false, error: 'Synthèse inconnue' };
  if (!synthese.contenu) {
    return {
      success: false,
      error: 'Snapshot manquant, régénérez la synthèse',
    };
  }
  if (synthese.statut === 'en_attente_arbitrage') {
    return { success: false, error: 'Synthèse déjà soumise' };
  }

  const reco = await getRecoBySynthese(syntheseId);
  const snapshot = normalizeSnapshot(synthese.contenu);
  const saisies = saisiesOf(synthese, reco);

  let complet: Buffer;
  let cdp: Buffer;
  try {
    [complet, cdp] = await Promise.all([
      renderSynthesePdf(snapshot, saisies, 'complet'),
      renderSynthesePdf(snapshot, saisies, 'cdp'),
    ]);
  } catch (err) {
    logger.error('actions.passation', 'render synthese failed', {
      syntheseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: 'Échec de la génération du PDF' };
  }

  const dossier = synthese.prospect_id ?? synthese.id;
  const ts = Date.now();
  const pathComplet = `${dossier}/synthese-complet-${ts}.pdf`;
  const pathCdp = `${dossier}/synthese-cdp-${ts}.pdf`;
  for (const [path, buffer] of [
    [pathComplet, complet],
    [pathCdp, cdp],
  ] as const) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (error) {
      logger.error('actions.passation', 'upload synthese failed', {
        path,
        error,
      });
      return { success: false, error: "Échec de l'upload du document" };
    }
  }

  const { error } = await supabase
    .from('document_synthese')
    .update({
      statut: 'en_attente_arbitrage',
      pdf_path_complet: pathComplet,
      pdf_path_cdp: pathCdp,
      soumise_at: new Date().toISOString(),
      soumise_par: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', syntheseId);
  if (error) return { success: false, error: error.message };

  // Destinataires vague 1 : Référents CDP + Direction (admins actifs).
  const destinataires = new Map<string, string | null>();
  const { data: referents } = await supabase
    .from('users')
    .select('id, email')
    .eq('referent_cdp', true)
    .eq('actif', true);
  for (const r of referents ?? []) destinataires.set(r.id, r.email);
  const { data: admins } = await supabase
    .from('users')
    .select('id, email')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  for (const a of admins ?? []) destinataires.set(a.id, a.email);
  destinataires.delete(userId);

  const lienApp = synthese.prospect_id
    ? `/commercial/prospects/${synthese.prospect_id}`
    : '/commercial/cdp';
  if (destinataires.size > 0) {
    await supabase.from('notifications').insert(
      [...destinataires.keys()].map((uid) => ({
        user_id: uid,
        type: 'passation_diffusee' as const,
        titre: 'Synthèse de passation à traiter',
        message: `La synthèse de ${snapshot.identite.raisonSociale} est soumise. Affectez un Chef de Projet (délai cible 24h).`,
        lien: lienApp,
      })),
    );
    const emails = [...destinataires.values()].filter((e): e is string =>
      Boolean(e),
    );
    if (emails.length > 0) {
      await sendSyntheseVague1Email({
        to: emails,
        raisonSociale: snapshot.identite.raisonSociale,
        referenceDossier: snapshot.meta.referenceDossier,
        developpeur: snapshot.meta.developpeur,
        lienFiche: `${getAppUrl()}${lienApp}`,
        pdfComplet: complet,
      });
    }
  }

  logAudit(
    'synthese_soumise',
    'document_synthese',
    syntheseId,
    undefined,
    userId,
  );
  if (synthese.prospect_id) {
    revalidatePath(`/commercial/prospects/${synthese.prospect_id}`);
  }
  return { success: true };
}

/**
 * Vague 2 manuelle (fallback admin) : marque la synthèse transmise au CDP
 * affecté du client lié et le notifie. Le chemin nominal est automatique via
 * l'affectation CDP (lib/actions/cdp.ts).
 */
export async function diffuserVague2(
  syntheseId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { success: false, error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('id, client_id, pdf_path_cdp, reference_dossier')
    .eq('id', syntheseId)
    .single();
  if (!synthese) return { success: false, error: 'Synthèse inconnue' };
  if (!synthese.client_id) {
    return { success: false, error: 'Aucun client lié à cette synthèse' };
  }
  if (!synthese.pdf_path_cdp) {
    return {
      success: false,
      error: 'Document CDP indisponible, soumettez la synthèse',
    };
  }

  const { data: client } = await supabase
    .from('clients')
    .select('raison_sociale, cdp_referent_id')
    .eq('id', synthese.client_id)
    .single();
  if (!client?.cdp_referent_id) {
    return { success: false, error: 'Aucun CDP affecté au client' };
  }

  const { error } = await supabase
    .from('document_synthese')
    .update({
      statut: 'cdp_affecte',
      diffuse_vague2_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syntheseId);
  if (error) return { success: false, error: error.message };

  if (client.cdp_referent_id !== userId) {
    await supabase.from('notifications').insert({
      user_id: client.cdp_referent_id,
      type: 'passation_diffusee' as const,
      titre: 'Synthèse de passation reçue',
      message: `La synthèse de passation de ${client.raison_sociale} vous a été transmise.`,
      lien: '/commercial/cdp',
    });
  }

  logAudit(
    'synthese_diffusee_vague2',
    'document_synthese',
    syntheseId,
    undefined,
    userId,
  );
  revalidatePath('/commercial/cdp');
  return { success: true };
}

/** Lien signé (5 min) vers l'une des deux variantes — pipeline/admin. */
export async function getSyntheseDownloadUrl(
  syntheseId: string,
  variante: 'complet' | 'cdp',
): Promise<{ url?: string; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId || !(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('pdf_path_complet, pdf_path_cdp')
    .eq('id', syntheseId)
    .single();
  const path =
    variante === 'complet'
      ? synthese?.pdf_path_complet
      : synthese?.pdf_path_cdp;
  if (!path) return { error: 'Document indisponible' };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data) return { error: 'Lien indisponible' };
  return { url: data.signedUrl };
}

/**
 * Lien signé vers la variante CDP pour le Chef de Projet affecté. Le guard est
 * la RLS : la ligne n'est lisible par le CDP que si statut='cdp_affecte' ET
 * qu'il est le cdp_referent_id du client. La policy storage ne couvrant que le
 * pipeline, l'URL signée est générée via le client service-role APRÈS cette
 * lecture RLS.
 */
export async function getSyntheseCdpDownloadUrl(
  syntheseId: string,
): Promise<{ url?: string; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { error: 'Synthèse invalide' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

  // Lecture via RLS : ne renvoie la ligne que si l'utilisateur y a droit
  // (pipeline/admin, ou CDP affecté du client une fois la vague 2 déclenchée).
  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('id, pdf_path_cdp')
    .eq('id', syntheseId)
    .maybeSingle();
  if (!synthese) return { error: 'Accès refusé' };
  if (!synthese.pdf_path_cdp) return { error: 'Document indisponible' };

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(synthese.pdf_path_cdp, 300);
  if (error || !data) return { error: 'Lien indisponible' };
  return { url: data.signedUrl };
}

/**
 * État courant de la passation pour la fiche prospect : synthèse + saisies
 * (reco) + présence d'un CDP référent sur le client lié.
 */
export async function getPassationState(prospectId: string): Promise<{
  synthese: PassationSynthese | null;
  reco: PassationReco | null;
  hasCdpReferent: boolean;
  error?: string;
}> {
  if (!uuidSchema.safeParse(prospectId).success) {
    return {
      synthese: null,
      reco: null,
      hasCdpReferent: false,
      error: 'Prospect invalide',
    };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId || !(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return {
      synthese: null,
      reco: null,
      hasCdpReferent: false,
      error: 'Accès refusé',
    };
  }

  const synthese = await getSyntheseByProspect(prospectId);
  const reco = synthese ? await getRecoBySynthese(synthese.id) : null;

  let hasCdpReferent = false;
  if (synthese?.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('cdp_referent_id')
      .eq('id', synthese.client_id)
      .maybeSingle();
    hasCdpReferent = Boolean(client?.cdp_referent_id);
  }

  return { synthese, reco, hasCdpReferent };
}
