'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { renderSynthesePdf } from '@/lib/utils/synthese-pdf';
import {
  getSyntheseData,
  getSyntheseByProspect,
} from '@/lib/queries/passation';
import type { PassationSynthese } from '@/lib/queries/passation';
import type { Database, Json } from '@/types/database';

const BUCKET = 'passation-documents';
const uuidSchema = z.string().uuid();

type Role = Database['public']['Enums']['role_utilisateur'];

async function getAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      userId: null,
      role: null as Role | null,
      pipeline: false,
    };
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();
  return {
    supabase,
    userId: user.id,
    role: (profile?.role ?? null) as Role | null,
    pipeline: profile?.pipeline_access ?? false,
  };
}

/**
 * Génère la synthèse de passation : un PDF complet (sections 1 à 8, pour
 * Référent CDP + Direction) et un PDF CDP (section 8 masquée). Snapshot figé
 * stocké dans `document_synthese.contenu`.
 */
export async function genererSynthese(
  prospectId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!uuidSchema.safeParse(prospectId).success) {
    return { success: false, error: 'Prospect invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const data = await getSyntheseData(prospectId);
  if (!data) return { success: false, error: 'Prospect introuvable' };

  // La synthèse de passation n'a de sens qu'après la signature du contrat.
  const signe =
    data.prospect.stage === 'signe' || data.prospect.client_id != null;
  if (!signe) {
    return {
      success: false,
      error: 'Le prospect doit être signé pour générer la synthèse',
    };
  }

  let complet: Buffer;
  let cdp: Buffer;
  try {
    [complet, cdp] = await Promise.all([
      renderSynthesePdf(data, true),
      renderSynthesePdf(data, false),
    ]);
  } catch (err) {
    logger.error('actions.passation', 'render synthese failed', {
      prospectId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: 'Échec de la génération du PDF' };
  }

  const ts = Date.now();
  const pathComplet = `${prospectId}/synthese-complet-${ts}.pdf`;
  const pathCdp = `${prospectId}/synthese-cdp-${ts}.pdf`;

  const upComplet = await supabase.storage
    .from(BUCKET)
    .upload(pathComplet, complet, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (upComplet.error) {
    logger.error('actions.passation', 'upload complet failed', {
      error: upComplet.error,
    });
    return { success: false, error: "Échec de l'upload du document complet" };
  }
  const upCdp = await supabase.storage.from(BUCKET).upload(pathCdp, cdp, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upCdp.error) {
    logger.error('actions.passation', 'upload cdp failed', {
      error: upCdp.error,
    });
    return { success: false, error: "Échec de l'upload du document CDP" };
  }

  const snapshot = data as unknown as Json;
  const existing = await getSyntheseByProspect(prospectId);

  let id: string;
  if (existing) {
    const { error } = await supabase
      .from('document_synthese')
      .update({
        statut: 'generee',
        contenu: snapshot,
        pdf_path_complet: pathComplet,
        pdf_path_cdp: pathCdp,
        signature_id: data.signature?.id ?? null,
        genere_par: userId,
        diffuse_vague1_at: null,
        diffuse_vague2_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
    id = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from('document_synthese')
      .insert({
        prospect_id: prospectId,
        statut: 'generee',
        contenu: snapshot,
        pdf_path_complet: pathComplet,
        pdf_path_cdp: pathCdp,
        signature_id: data.signature?.id ?? null,
        genere_par: userId,
      })
      .select('id')
      .single();
    if (error || !created) {
      return { success: false, error: error?.message ?? 'Création impossible' };
    }
    id = created.id;
  }

  logAudit('synthese_generee', 'document_synthese', id, { prospectId }, userId);
  revalidatePath(`/commercial/prospects/${prospectId}`);
  return { success: true, id };
}

/**
 * Vague 1 : diffuse la version complète aux Référents CDP + Direction
 * (déclencheur de l'affectation d'un Chef de Projet).
 */
export async function diffuserVague1(
  syntheseId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { success: false, error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('id, prospect_id, pdf_path_complet')
    .eq('id', syntheseId)
    .single();
  if (!synthese) return { success: false, error: 'Synthèse inconnue' };
  if (!synthese.pdf_path_complet) {
    return {
      success: false,
      error: 'Document complet indisponible, régénérez la synthèse',
    };
  }

  const { data: prospect } = await supabase
    .from('prospects')
    .select('nom')
    .eq('id', synthese.prospect_id)
    .single();

  const recipients = new Set<string>();
  const { data: referents } = await supabase
    .from('users')
    .select('id')
    .eq('referent_cdp', true)
    .eq('actif', true);
  for (const r of referents ?? []) recipients.add(r.id);
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'superadmin'])
    .eq('actif', true);
  for (const a of admins ?? []) recipients.add(a.id);
  recipients.delete(userId);

  if (recipients.size > 0) {
    await supabase.from('notifications').insert(
      [...recipients].map((uid) => ({
        user_id: uid,
        type: 'passation_diffusee' as const,
        titre: 'Synthèse de passation à traiter',
        message: `La synthèse de passation de ${prospect?.nom ?? 'ce prospect'} est disponible (version complète). Affectez un Chef de Projet.`,
        lien: `/commercial/prospects/${synthese.prospect_id}`,
      })),
    );
  }

  const { error } = await supabase
    .from('document_synthese')
    .update({
      statut: 'diffusee_vague1',
      diffuse_vague1_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syntheseId);
  if (error) return { success: false, error: error.message };

  logAudit(
    'synthese_diffusee_vague1',
    'document_synthese',
    syntheseId,
    undefined,
    userId,
  );
  revalidatePath(`/commercial/prospects/${synthese.prospect_id}`);
  return { success: true };
}

/**
 * Vague 2 : transmet la version CDP (sans section 8) au Chef de Projet affecté
 * au client lié. Échoue si aucun CDP référent n'est défini sur le client.
 */
export async function diffuserVague2(
  syntheseId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { success: false, error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuth();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select('id, prospect_id, pdf_path_cdp')
    .eq('id', syntheseId)
    .single();
  if (!synthese) return { success: false, error: 'Synthèse inconnue' };
  if (!synthese.pdf_path_cdp) {
    return {
      success: false,
      error: 'Document CDP indisponible, régénérez la synthèse',
    };
  }

  const { data: prospect } = await supabase
    .from('prospects')
    .select('nom, client_id')
    .eq('id', synthese.prospect_id)
    .single();
  if (!prospect?.client_id) {
    return { success: false, error: 'Aucun client lié à ce prospect' };
  }

  const { data: client } = await supabase
    .from('clients')
    .select('cdp_referent_id')
    .eq('id', prospect.client_id)
    .single();
  if (!client?.cdp_referent_id) {
    return { success: false, error: 'Aucun CDP affecté au client' };
  }

  if (client.cdp_referent_id !== userId) {
    await supabase.from('notifications').insert({
      user_id: client.cdp_referent_id,
      type: 'passation_diffusee' as const,
      titre: 'Synthèse de passation reçue',
      message: `La synthèse de passation de ${prospect.nom} vous a été transmise.`,
      lien: `/commercial/prospects/${synthese.prospect_id}`,
    });
  }

  const { error } = await supabase
    .from('document_synthese')
    .update({
      statut: 'diffusee_vague2',
      diffuse_vague2_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syntheseId);
  if (error) return { success: false, error: error.message };

  logAudit(
    'synthese_diffusee_vague2',
    'document_synthese',
    syntheseId,
    undefined,
    userId,
  );
  revalidatePath(`/commercial/prospects/${synthese.prospect_id}`);
  return { success: true };
}

/** Lien signé (5 min) vers l'une des deux variantes du PDF de synthèse. */
export async function getSyntheseDownloadUrl(
  syntheseId: string,
  variante: 'complet' | 'cdp',
): Promise<{ url?: string; error?: string }> {
  if (!uuidSchema.safeParse(syntheseId).success) {
    return { error: 'Synthèse invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuth();
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
 * État courant de la passation pour la fiche prospect : synthèse existante (si
 * déjà générée) et présence d'un CDP référent sur le client lié (pré-requis de
 * la vague 2). Lecture utilisée par le composant client de la fiche.
 */
export async function getPassationState(prospectId: string): Promise<{
  synthese: PassationSynthese | null;
  hasCdpReferent: boolean;
  error?: string;
}> {
  if (!uuidSchema.safeParse(prospectId).success) {
    return {
      synthese: null,
      hasCdpReferent: false,
      error: 'Prospect invalide',
    };
  }
  const { supabase, userId, role, pipeline } = await getAuth();
  if (!userId || !(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { synthese: null, hasCdpReferent: false, error: 'Accès refusé' };
  }

  const synthese = await getSyntheseByProspect(prospectId);

  let hasCdpReferent = false;
  const { data: prospect } = await supabase
    .from('prospects')
    .select('client_id')
    .eq('id', prospectId)
    .single();
  if (prospect?.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('cdp_referent_id')
      .eq('id', prospect.client_id)
      .maybeSingle();
    hasCdpReferent = Boolean(client?.cdp_referent_id);
  }

  return { synthese, hasCdpReferent };
}
