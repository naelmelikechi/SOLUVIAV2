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

function getTypeDocument(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('wordprocessing'))
    return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
    return 'Excel';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'Autre';
}

export async function uploadClientDocument(
  clientId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Aucun fichier selectionne' };
  }

  // Validate file type
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      success: false,
      error:
        'Type de fichier non supporte. Formats acceptes : PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, WEBP',
    };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'Le fichier ne doit pas depasser 10 Mo' };
  }

  // Build storage path: {clientId}/{timestamp}-{filename}
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${clientId}/${timestamp}-${safeName}`;

  // Upload to Supabase Storage
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

  // Insert metadata into client_documents table
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
    // Attempt to clean up the uploaded file
    await supabase.storage.from('client-documents').remove([storagePath]);
    return {
      success: false,
      error:
        insertError.message ||
        "Erreur lors de l'enregistrement des metadonnees",
    };
  }

  logAudit('document_uploaded', 'client_document', clientId, {
    nom_fichier: file.name,
    type_document: typeDocument,
  });

  revalidatePath(`/admin/clients/${clientId}`);

  return { success: true };
}

export async function getDocumentDownloadUrl(
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifie' };

  const { data, error } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, 60); // 60 seconds expiry

  if (error) {
    logger.error('actions.documents', 'getDocumentDownloadUrl failed', {
      error,
      storagePath,
    });
    return { error: 'Impossible de generer le lien de telechargement' };
  }

  return { url: data.signedUrl };
}

export async function deleteClientDocument(
  documentId: string,
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifie' };

  // Get the document to find storage path
  const { data: doc, error: fetchError } = await supabase
    .from('client_documents')
    .select('storage_path, nom_fichier')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    return { success: false, error: 'Document introuvable' };
  }

  // Delete from storage
  await supabase.storage.from('client-documents').remove([doc.storage_path]);

  // Delete metadata
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
