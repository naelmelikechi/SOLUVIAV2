'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export type DocumentBucket = 'client-documents' | 'project-documents';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid('ID doit etre un UUID');
const projetRefSchema = z
  .string()
  .trim()
  .min(1, 'Référence projet requise')
  .max(64, 'Référence projet trop longue');
const storagePathSchema = z
  .string()
  .trim()
  .min(1, 'Storage path requis')
  .max(1024, 'Storage path trop long');
const bucketSchema = z.enum(['client-documents', 'project-documents']);

// Métadata fichier extraite (filename, size, type) - le File lui-même n'est pas
// validé par Zod (FormData côté serveur).
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

const UploadClientDocumentSchema = z.object({
  clientId: uuidSchema,
  fileMeta: FileMetadataSchema,
});

const UploadProjetDocumentSchema = z.object({
  projetId: uuidSchema,
  projetRef: projetRefSchema,
  fileMeta: FileMetadataSchema,
});

const GetDownloadUrlSchema = z.object({
  storagePath: storagePathSchema,
  bucket: bucketSchema,
});

const DeleteClientDocumentSchema = z.object({
  documentId: uuidSchema,
  clientId: uuidSchema,
});

const DeleteProjetDocumentSchema = z.object({
  documentId: uuidSchema,
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

function buildStoragePath(ownerId: string, fileName: string): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ownerId}/${timestamp}-${safeName}`;
}

export async function uploadClientDocument(
  clientId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Aucun fichier sélectionné' };
  }
  const parsed = UploadClientDocumentSchema.safeParse({
    clientId,
    fileMeta: { name: file.name, size: file.size, type: file.type },
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  clientId = parsed.data.clientId;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const storagePath = buildStoragePath(clientId, file.name);

  const { error: uploadError } = await supabase.storage
    .from('client-documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    logger.error('actions.documents', 'uploadClientDocument failed', {
      error: uploadError,
      clientId,
      fileName: file.name,
    });
    return {
      success: false,
      error: uploadError.message || "Erreur lors de l'upload du fichier",
    };
  }

  const typeDocument = getTypeDocument(file.type);
  const { error: insertError } = await supabase
    .from('client_documents')
    .insert({
      client_id: clientId,
      nom_fichier: file.name,
      type_document: typeDocument,
      storage_path: storagePath,
      user_id: user.id,
    });

  if (insertError) {
    logger.error('actions.documents', 'insert client_documents failed', {
      error: insertError,
      clientId,
    });
    await supabase.storage.from('client-documents').remove([storagePath]);
    return {
      success: false,
      error:
        insertError.message ||
        "Erreur lors de l'enregistrement des métadonnées",
    };
  }

  logAudit(
    'document_uploaded',
    'client_document',
    clientId,
    {
      nom_fichier: file.name,
      type_document: typeDocument,
    },
    user.id,
  );

  revalidatePath(`/admin/clients/${clientId}`);

  return { success: true };
}

export async function uploadProjetDocument(
  projetId: string,
  projetRef: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Aucun fichier sélectionné' };
  }
  const parsed = UploadProjetDocumentSchema.safeParse({
    projetId,
    projetRef,
    fileMeta: { name: file.name, size: file.size, type: file.type },
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  projetId = parsed.data.projetId;
  projetRef = parsed.data.projetRef;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const storagePath = buildStoragePath(projetId, file.name);

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    logger.error('actions.documents', 'uploadProjetDocument failed', {
      error: uploadError,
      projetId,
      fileName: file.name,
    });
    return {
      success: false,
      error: uploadError.message || "Erreur lors de l'upload du fichier",
    };
  }

  const typeDocument = getTypeDocument(file.type);
  const { error: insertError } = await supabase
    .from('projet_documents')
    .insert({
      projet_id: projetId,
      nom_fichier: file.name,
      type_document: typeDocument,
      storage_path: storagePath,
      user_id: user.id,
    });

  if (insertError) {
    logger.error('actions.documents', 'insert projet_documents failed', {
      error: insertError,
      projetId,
    });
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
    'projet_document',
    projetId,
    {
      nom_fichier: file.name,
      type_document: typeDocument,
    },
    user.id,
  );

  revalidatePath(`/projets/${projetRef}`);

  return { success: true };
}

export async function getDocumentDownloadUrl(
  storagePath: string,
  bucket: DocumentBucket = 'client-documents',
): Promise<{ url?: string; error?: string }> {
  const parsed = GetDownloadUrlSchema.safeParse({ storagePath, bucket });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  storagePath = parsed.data.storagePath;
  bucket = parsed.data.bucket;

  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60);

  if (error) {
    logger.error('actions.documents', 'getDocumentDownloadUrl failed', {
      error,
      storagePath,
      bucket,
    });
    return { error: 'Impossible de générer le lien de téléchargement' };
  }

  return { url: data.signedUrl };
}

export async function deleteClientDocument(
  documentId: string,
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteClientDocumentSchema.safeParse({ documentId, clientId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  documentId = parsed.data.documentId;
  clientId = parsed.data.clientId;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: doc, error: fetchError } = await supabase
    .from('client_documents')
    .select('storage_path, nom_fichier')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    return { success: false, error: 'Document introuvable' };
  }

  await supabase.storage.from('client-documents').remove([doc.storage_path]);

  const { error: deleteError } = await supabase
    .from('client_documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) {
    logger.error('actions.documents', 'deleteClientDocument failed', {
      error: deleteError,
      documentId,
    });
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  logAudit(
    'document_deleted',
    'client_document',
    documentId,
    {
      nom_fichier: doc.nom_fichier,
    },
    user.id,
  );

  revalidatePath(`/admin/clients/${clientId}`);

  return { success: true };
}

export async function deleteProjetDocument(
  documentId: string,
  projetRef: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteProjetDocumentSchema.safeParse({
    documentId,
    projetRef,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  documentId = parsed.data.documentId;
  projetRef = parsed.data.projetRef;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: doc, error: fetchError } = await supabase
    .from('projet_documents')
    .select('storage_path, nom_fichier')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    return { success: false, error: 'Document introuvable' };
  }

  await supabase.storage.from('project-documents').remove([doc.storage_path]);

  const { error: deleteError } = await supabase
    .from('projet_documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) {
    logger.error('actions.documents', 'deleteProjetDocument failed', {
      error: deleteError,
      documentId,
    });
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  logAudit(
    'document_deleted',
    'projet_document',
    documentId,
    {
      nom_fichier: doc.nom_fichier,
    },
    user.id,
  );

  revalidatePath(`/projets/${projetRef}`);

  return { success: true };
}
