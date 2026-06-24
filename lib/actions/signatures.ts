'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthWithPipeline } from '@/lib/auth/guards';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeFileName } from '@/lib/utils/strings';

const BUCKET = 'signature-documents';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

const uuidSchema = z.string().uuid();
const titreSchema = z.string().trim().min(1, 'Titre requis').max(200);

async function uploadToBucket(
  supabase: SupabaseClient<Database>,
  prospectId: string,
  file: File,
  kind: string,
): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'Fichier trop volumineux (max 25 Mo)' };
  }
  const path = `${prospectId}/${kind}-${Date.now()}-${sanitizeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    logger.error('actions.signatures', 'upload failed', { error });
    return { error: "Échec de l'upload du document" };
  }
  return { path };
}

/** Crée une demande de signature (mode manuel) avec le contrat à signer. */
export async function createSignatureRequest(
  prospectId: string,
  formData: FormData,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!uuidSchema.safeParse(prospectId).success) {
    return { success: false, error: 'Prospect invalide' };
  }
  const titreParsed = titreSchema.safeParse(formData.get('titre'));
  if (!titreParsed.success) {
    return { success: false, error: titreParsed.error.issues[0]?.message };
  }

  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  let documentPath: string | null = null;
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    const up = await uploadToBucket(supabase, prospectId, file, 'a-signer');
    if (up.error) return { success: false, error: up.error };
    documentPath = up.path ?? null;
  }

  const { data: created, error } = await supabase
    .from('signature_requests')
    .insert({
      prospect_id: prospectId,
      titre: titreParsed.data,
      provider: 'manuel',
      statut: 'brouillon',
      document_path: documentPath,
      initiated_by: userId,
    })
    .select('id')
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? 'Création impossible' };
  }

  logAudit(
    'signature_request_created',
    'signature_request',
    created.id,
    undefined,
    userId,
  );
  revalidatePath(`/commercial/prospects/${prospectId}`);
  return { success: true, id: created.id };
}

const StatutChangeSchema = z.object({
  id: uuidSchema,
  statut: z.enum(['envoyee', 'refusee', 'expiree', 'annulee']),
});

/** Met à jour le statut d'une demande (envoyée / refusée / expirée / annulée). */
export async function updateSignatureStatut(
  id: string,
  statut: 'envoyee' | 'refusee' | 'expiree' | 'annulee',
): Promise<{ success: boolean; error?: string }> {
  const parsed = StatutChangeSchema.safeParse({ id, statut });
  if (!parsed.success) {
    return { success: false, error: 'Statut invalide' };
  }

  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const patch: Database['public']['Tables']['signature_requests']['Update'] = {
    statut: parsed.data.statut,
  };
  if (parsed.data.statut === 'envoyee') {
    patch.sent_at = new Date().toISOString();
  }

  const { data: row, error } = await supabase
    .from('signature_requests')
    .update(patch)
    .eq('id', id)
    .select('prospect_id')
    .single();
  if (error) return { success: false, error: error.message };

  logAudit(
    'signature_request_statut',
    'signature_request',
    id,
    { statut },
    userId,
  );
  if (row?.prospect_id) {
    revalidatePath(`/commercial/prospects/${row.prospect_id}`);
  }
  return { success: true };
}

/**
 * Dépose le contrat signé (preuve) → statut 'signee'. Notifie le commercial et
 * la Direction (déclencheur de la passation Dev → CDP, Feature 6).
 */
export async function uploadSignedDocument(
  id: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  if (!uuidSchema.safeParse(id).success) {
    return { success: false, error: 'Demande invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { success: false, error: 'Accès refusé' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Contrat signé requis' };
  }

  const { data: req } = await supabase
    .from('signature_requests')
    .select('prospect_id')
    .eq('id', id)
    .single();
  if (!req) return { success: false, error: 'Demande inconnue' };

  const up = await uploadToBucket(supabase, req.prospect_id, file, 'signe');
  if (up.error) return { success: false, error: up.error };

  const { error } = await supabase
    .from('signature_requests')
    .update({
      signed_document_path: up.path,
      statut: 'signee',
      signed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  // Déclencheur passation : prévenir le commercial du prospect + la Direction.
  const { data: prospect } = await supabase
    .from('prospects')
    .select('nom, commercial_id')
    .eq('id', req.prospect_id)
    .single();
  const recipients = new Set<string>();
  if (prospect?.commercial_id) recipients.add(prospect.commercial_id);
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
        type: 'contrat_signe' as const,
        titre: 'Contrat signé',
        message: `Le contrat de ${prospect?.nom ?? 'ce prospect'} est signé. Passation à initier.`,
        lien: `/commercial/prospects/${req.prospect_id}`,
      })),
    );
  }

  logAudit(
    'signature_request_signed',
    'signature_request',
    id,
    undefined,
    userId,
  );
  revalidatePath(`/commercial/prospects/${req.prospect_id}`);
  return { success: true };
}

export async function getSignatureDocumentUrl(
  id: string,
  kind: 'document' | 'signed',
): Promise<{ url?: string; error?: string }> {
  if (!uuidSchema.safeParse(id).success) {
    return { error: 'Demande invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId || !(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { error: 'Accès refusé' };
  }
  const { data: req } = await supabase
    .from('signature_requests')
    .select('document_path, signed_document_path')
    .eq('id', id)
    .single();
  const path =
    kind === 'signed' ? req?.signed_document_path : req?.document_path;
  if (!path) return { error: 'Document indisponible' };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data) return { error: 'Lien indisponible' };
  return { url: data.signedUrl };
}
