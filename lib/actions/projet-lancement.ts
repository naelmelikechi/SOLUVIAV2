'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { ACCEPTED_TYPES, MAX_FILE_SIZE } from './documents-constants';
import {
  LANCEMENT_ETAPE_KEYS,
  LANCEMENT_STATUT_KEYS,
} from '@/lib/lancement/constants';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid('ID doit être un UUID');
const projetRefSchema = z
  .string()
  .trim()
  .min(1, 'Référence projet requise')
  .max(64, 'Référence projet trop longue');
const etapeKeySchema = z.enum(LANCEMENT_ETAPE_KEYS as [string, ...string[]], {
  message: 'Étape inconnue',
});
const statutSchema = z.enum(LANCEMENT_STATUT_KEYS as [string, ...string[]], {
  message: 'Statut invalide',
});

const FileMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nom de fichier requis')
    .max(512, 'Nom de fichier trop long'),
  size: z
    .number()
    .int('Taille doit etre un entier')
    .positive('Fichier vide')
    .max(MAX_FILE_SIZE, 'Le fichier ne doit pas dépasser 10 Mo'),
  type: z.string().refine((v) => ACCEPTED_TYPES.includes(v), {
    message:
      'Type de fichier non supporté. Formats acceptés : PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, WEBP',
  }),
});

const SetStatutSchema = z.object({
  projetId: uuidSchema,
  projetRef: projetRefSchema,
  etapeKey: etapeKeySchema,
  statut: statutSchema,
});

const UploadDocumentSchema = z.object({
  projetId: uuidSchema,
  projetRef: projetRefSchema,
  etapeKey: etapeKeySchema,
  fileMeta: FileMetadataSchema,
});

const DeleteDocumentSchema = z.object({
  documentId: uuidSchema,
  projetRef: projetRefSchema,
});

const AddCommentaireSchema = z.object({
  projetId: uuidSchema,
  projetRef: projetRefSchema,
  etapeKey: etapeKeySchema,
  contenu: z
    .string()
    .trim()
    .min(1, 'Commentaire vide')
    .max(4000, 'Commentaire trop long (4000 caractères max)'),
});

const DeleteCommentaireSchema = z.object({
  commentaireId: uuidSchema,
  projetRef: projetRefSchema,
});

function getTypeDocument(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('wordprocessing'))
    return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
    return 'Excel';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'Autre';
}

// ---------------------------------------------------------------------------
// Statut d'etape (upsert : la row n'existe que si l'etape a deja ete touchee)
// ---------------------------------------------------------------------------

export async function setLancementEtapeStatut(
  projetId: string,
  projetRef: string,
  etapeKey: string,
  statut: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = SetStatutSchema.safeParse({
    projetId,
    projetRef,
    etapeKey,
    statut,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('projet_lancement_etapes').upsert(
    {
      projet_id: parsed.data.projetId,
      etape_key: parsed.data.etapeKey,
      statut: parsed.data.statut,
      updated_by: user.id,
    },
    { onConflict: 'projet_id,etape_key' },
  );

  if (error) {
    logger.error('actions.projet-lancement', 'setLancementEtapeStatut failed', {
      error,
      projetId: parsed.data.projetId,
      etapeKey: parsed.data.etapeKey,
    });
    return {
      success: false,
      error: 'Erreur lors de la mise à jour du statut',
    };
  }

  logAudit(
    'lancement_statut_updated',
    'projet_lancement_etape',
    parsed.data.projetId,
    { etape_key: parsed.data.etapeKey, statut: parsed.data.statut },
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Documents d'etape (bucket project-documents, prefixe lancement/)
// ---------------------------------------------------------------------------

export async function uploadLancementDocument(
  projetId: string,
  projetRef: string,
  etapeKey: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Aucun fichier sélectionné' };
  }
  const parsed = UploadDocumentSchema.safeParse({
    projetId,
    projetRef,
    etapeKey,
    fileMeta: { name: file.name, size: file.size, type: file.type },
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${parsed.data.projetId}/lancement/${parsed.data.etapeKey}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    logger.error('actions.projet-lancement', 'uploadLancementDocument failed', {
      error: uploadError,
      projetId: parsed.data.projetId,
      fileName: file.name,
    });
    return {
      success: false,
      error: uploadError.message || "Erreur lors de l'upload du fichier",
    };
  }

  const typeDocument = getTypeDocument(file.type);
  const { error: insertError } = await supabase
    .from('projet_lancement_documents')
    .insert({
      projet_id: parsed.data.projetId,
      etape_key: parsed.data.etapeKey,
      nom_fichier: file.name,
      type_document: typeDocument,
      storage_path: storagePath,
      user_id: user.id,
    });

  if (insertError) {
    logger.error(
      'actions.projet-lancement',
      'insert projet_lancement_documents failed',
      { error: insertError, projetId: parsed.data.projetId },
    );
    await supabase.storage.from('project-documents').remove([storagePath]);
    return {
      success: false,
      error:
        insertError.message ||
        "Erreur lors de l'enregistrement des métadonnées",
    };
  }

  logAudit(
    'document_uploaded',
    'projet_lancement_document',
    parsed.data.projetId,
    {
      etape_key: parsed.data.etapeKey,
      nom_fichier: file.name,
      type_document: typeDocument,
    },
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}

export async function deleteLancementDocument(
  documentId: string,
  projetRef: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteDocumentSchema.safeParse({ documentId, projetRef });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: doc, error: fetchError } = await supabase
    .from('projet_lancement_documents')
    .select('storage_path, nom_fichier, etape_key')
    .eq('id', parsed.data.documentId)
    .single();

  if (fetchError || !doc) {
    return { success: false, error: 'Document introuvable' };
  }

  const { error: storageError } = await supabase.storage
    .from('project-documents')
    .remove([doc.storage_path]);
  if (storageError) {
    // Storage echec : on continue le delete DB pour ne pas laisser une row
    // orpheline. Le fichier reste en storage mais ne sera plus reference.
    logger.warn('actions.projet-lancement', 'storage remove failed', {
      documentId: parsed.data.documentId,
      storagePath: doc.storage_path,
      error: storageError,
    });
  }

  const { error: deleteError } = await supabase
    .from('projet_lancement_documents')
    .delete()
    .eq('id', parsed.data.documentId);

  if (deleteError) {
    logger.error('actions.projet-lancement', 'deleteLancementDocument failed', {
      error: deleteError,
      documentId: parsed.data.documentId,
    });
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  logAudit(
    'document_deleted',
    'projet_lancement_document',
    parsed.data.documentId,
    { nom_fichier: doc.nom_fichier, etape_key: doc.etape_key },
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Commentaires d'etape
// ---------------------------------------------------------------------------

export async function addLancementCommentaire(
  projetId: string,
  projetRef: string,
  etapeKey: string,
  contenu: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddCommentaireSchema.safeParse({
    projetId,
    projetRef,
    etapeKey,
    contenu,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('projet_lancement_commentaires')
    .insert({
      projet_id: parsed.data.projetId,
      etape_key: parsed.data.etapeKey,
      contenu: parsed.data.contenu,
      user_id: user.id,
    });

  if (error) {
    logger.error('actions.projet-lancement', 'addLancementCommentaire failed', {
      error,
      projetId: parsed.data.projetId,
      etapeKey: parsed.data.etapeKey,
    });
    return { success: false, error: "Erreur lors de l'ajout du commentaire" };
  }

  logAudit(
    'commentaire_added',
    'projet_lancement_commentaire',
    parsed.data.projetId,
    { etape_key: parsed.data.etapeKey },
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}

export async function deleteLancementCommentaire(
  commentaireId: string,
  projetRef: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteCommentaireSchema.safeParse({
    commentaireId,
    projetRef,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('projet_lancement_commentaires')
    .delete()
    .eq('id', parsed.data.commentaireId);

  if (error) {
    logger.error(
      'actions.projet-lancement',
      'deleteLancementCommentaire failed',
      { error, commentaireId: parsed.data.commentaireId },
    );
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  logAudit(
    'commentaire_deleted',
    'projet_lancement_commentaire',
    parsed.data.commentaireId,
    {},
    user.id,
  );

  revalidatePath(`/projets/${parsed.data.projetRef}`);

  return { success: true };
}
