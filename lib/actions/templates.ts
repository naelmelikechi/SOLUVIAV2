'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthWithPipeline } from '@/lib/auth/guards';
import { isAdmin, canAccessPipeline } from '@/lib/utils/roles';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { sanitizeFileName } from '@/lib/utils/strings';

const BUCKET = 'commercial-templates';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

/**
 * Publie une nouvelle version d'un modèle (Direction seule) : upload du fichier,
 * désactivation de l'ancienne version active, activation de la nouvelle, et
 * notification des Développeurs (Feature 4 §4/§9).
 */
export async function publishTemplateVersion(
  templateCode: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, userId, role } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) {
    return {
      success: false,
      error: 'Seule la Direction peut publier un modèle',
    };
  }

  const file = formData.get('file');
  const notes = (formData.get('notes') as string | null)?.trim() || null;
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Fichier requis' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'Fichier trop volumineux (max 25 Mo)' };
  }

  const { data: tmpl } = await supabase
    .from('document_templates')
    .select('id')
    .eq('code', templateCode)
    .single();
  if (!tmpl) return { success: false, error: 'Modèle inconnu' };

  const { data: last } = await supabase
    .from('document_template_versions')
    .select('version')
    .eq('template_id', tmpl.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (last?.version ?? 0) + 1;

  const path = `${tmpl.id}/v${nextVersion}-${Date.now()}-${sanitizeFileName(file.name, 'fichier')}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (upErr) {
    logger.error('actions.templates', 'upload failed', { error: upErr });
    return { success: false, error: 'Échec de l’upload du fichier' };
  }

  await supabase
    .from('document_template_versions')
    .update({ active: false })
    .eq('template_id', tmpl.id)
    .eq('active', true);

  const { error: insErr } = await supabase
    .from('document_template_versions')
    .insert({
      template_id: tmpl.id,
      version: nextVersion,
      storage_path: path,
      fichier_nom: file.name,
      notes,
      active: true,
      published_by: userId,
    });
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    logger.error('actions.templates', 'insert version failed', {
      error: insErr,
    });
    return { success: false, error: insErr.message };
  }

  // Notifie les Développeurs (accès pipeline) actifs, sauf l'auteur.
  const { data: devs } = await supabase
    .from('users')
    .select('id')
    .eq('pipeline_access', true)
    .eq('actif', true);
  const notifs = (devs ?? [])
    .filter((d) => d.id !== userId)
    .map((d) => ({
      user_id: d.id,
      type: 'modele_publie' as const,
      titre: 'Nouveau modèle publié',
      message: `Une nouvelle version d'un modèle documentaire est disponible.`,
      lien: '/commercial/modeles',
    }));
  if (notifs.length > 0) {
    await supabase.from('notifications').insert(notifs);
  }

  logAudit(
    'template_version_published',
    'document_template',
    tmpl.id,
    { code: templateCode, version: nextVersion },
    userId,
  );
  revalidatePath('/commercial/modeles');
  return { success: true };
}

export async function setActiveTemplateVersion(
  versionId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(versionId).success) {
    return { success: false, error: 'Version invalide' };
  }
  const { supabase, userId, role } = await getAuthWithPipeline();
  if (!userId) return { success: false, error: 'Non authentifié' };
  if (!isAdmin(role)) return { success: false, error: 'Accès refusé' };

  const { data: ver } = await supabase
    .from('document_template_versions')
    .select('template_id')
    .eq('id', versionId)
    .single();
  if (!ver) return { success: false, error: 'Version inconnue' };

  await supabase
    .from('document_template_versions')
    .update({ active: false })
    .eq('template_id', ver.template_id)
    .eq('active', true);
  const { error } = await supabase
    .from('document_template_versions')
    .update({ active: true })
    .eq('id', versionId);
  if (error) return { success: false, error: error.message };

  logAudit(
    'template_version_activated',
    'document_template',
    ver.template_id,
    { versionId },
    userId,
  );
  revalidatePath('/commercial/modeles');
  return { success: true };
}

export async function getTemplateDownloadUrl(
  versionId: string,
): Promise<{ url?: string; error?: string }> {
  if (!z.string().uuid().safeParse(versionId).success) {
    return { error: 'Version invalide' };
  }
  const { supabase, userId, role, pipeline } = await getAuthWithPipeline();
  if (!userId || !(isAdmin(role) || canAccessPipeline(role, pipeline))) {
    return { error: 'Accès refusé' };
  }
  const { data: ver } = await supabase
    .from('document_template_versions')
    .select('storage_path')
    .eq('id', versionId)
    .single();
  if (!ver) return { error: 'Version inconnue' };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ver.storage_path, 300);
  if (error || !data) return { error: 'Lien de téléchargement indisponible' };
  return { url: data.signedUrl };
}
