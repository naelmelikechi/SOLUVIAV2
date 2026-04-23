'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

function getTypeDocument(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('wordprocessing'))
    return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
    return 'Excel';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'Autre';
}

function validateFile(file: File | null): { error?: string; file?: File } {
  if (!file || file.size === 0) {
    return { error: 'Aucun fichier sélectionné' };
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      error:
        'Type de fichier non supporté. Formats acceptés : PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, WEBP',
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'Le fichier ne doit pas dépasser 10 Mo' };
  }
  return { file };
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const validation = validateFile(formData.get('file') as File | null);
  if (validation.error || !validation.file) {
    return { success: false, error: validation.error };
  }
  const file = validation.file;

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

  logAudit('document_uploaded', 'client_document', clientId, {
    nom_fichier: file.name,
    type_document: typeDocument,
  });

  revalidatePath(`/admin/clients/${clientId}`);

  return { success: true };
}

export async function uploadProjetDocument(
  projetId: string,
  projetRef: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const validation = validateFile(formData.get('file') as File | null);
  if (validation.error || !validation.file) {
    return { success: false, error: validation.error };
  }
  const file = validation.file;

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

  logAudit('document_uploaded', 'projet_document', projetId, {
    nom_fichier: file.name,
    type_document: typeDocument,
  });

  revalidatePath(`/projets/${projetRef}`);

  return { success: true };
}

export async function getDocumentDownloadUrl(
  storagePath: string,
  bucket: DocumentBucket = 'client-documents',
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié' };

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

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

  logAudit('document_deleted', 'client_document', documentId, {
    nom_fichier: doc.nom_fichier,
  });

  revalidatePath(`/admin/clients/${clientId}`);

  return { success: true };
}

export async function deleteProjetDocument(
  documentId: string,
  projetRef: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

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

  logAudit('document_deleted', 'projet_document', documentId, {
    nom_fichier: doc.nom_fichier,
  });

  revalidatePath(`/projets/${projetRef}`);

  return { success: true };
}
