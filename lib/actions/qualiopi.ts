'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/utils/encryption';
import { createEduviaQualityClient } from '@/lib/eduvia/quality-client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const SCOPE = 'actions.qualiopi';

async function getClientApiKey(clientId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('client_api_keys')
    .select('api_key_encrypted')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  try {
    return decryptApiKey(data.api_key_encrypted);
  } catch {
    return null;
  }
}

async function getCallerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Assignation responsable d'un indicateur (cote SOLUVIA)
// ---------------------------------------------------------------------------

export async function assignIndicatorResponsible(params: {
  clientId: string;
  campusId: number;
  indicatorId: number;
  userId: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const callerId = await getCallerUserId();
  if (!callerId) return { success: false, error: 'Non authentifié' };

  const supabase = await createClient();
  const { error } = await supabase.from('qualite_assignments').upsert(
    {
      client_id: params.clientId,
      campus_id: params.campusId,
      indicator_id: params.indicatorId,
      user_id: params.userId,
      created_by: callerId,
    },
    { onConflict: 'campus_id,indicator_id' },
  );
  if (error) {
    logger.error(SCOPE, 'assignIndicatorResponsible failed', { error });
    return { success: false, error: error.message };
  }
  logAudit('qualiopi_assignment', 'qualite_assignments', undefined, {
    indicator_id: params.indicatorId,
    user_id: params.userId,
  });
  revalidatePath(`/qualiopi`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Ajout d'une note (motif de rejet ou note libre) sur une evidence Eduvia
// ---------------------------------------------------------------------------

export async function addEvidenceNote(params: {
  clientId: string;
  campusId: number;
  evidenceId: number;
  kind: 'rejection' | 'note';
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const trimmed = params.message.trim();
  if (!trimmed) return { success: false, error: 'Message requis' };

  const callerId = await getCallerUserId();
  if (!callerId) return { success: false, error: 'Non authentifié' };

  const supabase = await createClient();
  const { error } = await supabase.from('qualite_evidence_notes').insert({
    client_id: params.clientId,
    campus_id: params.campusId,
    evidence_id: params.evidenceId,
    kind: params.kind,
    message: trimmed,
    author_id: callerId,
  });
  if (error) {
    logger.error(SCOPE, 'addEvidenceNote failed', { error });
    return { success: false, error: error.message };
  }
  logAudit('qualiopi_evidence_note', 'qualite_evidence_notes', undefined, {
    evidence_id: params.evidenceId,
    kind: params.kind,
  });
  revalidatePath(`/qualiopi`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Upload d'une preuve : push vers Eduvia API + revalidate
// ---------------------------------------------------------------------------

export async function uploadEvidence(formData: FormData): Promise<{
  success: boolean;
  evidenceId?: number;
  error?: string;
}> {
  const clientId = formData.get('clientId') as string | null;
  const campusIdStr = formData.get('campusId') as string | null;
  const deliverableIdStr = formData.get('deliverableId') as string | null;
  const file = formData.get('file') as File | null;

  if (!clientId || !campusIdStr || !deliverableIdStr || !file) {
    return { success: false, error: 'Paramètres manquants' };
  }
  const campusId = Number(campusIdStr);
  const deliverableId = Number(deliverableIdStr);
  if (Number.isNaN(campusId) || Number.isNaN(deliverableId)) {
    return { success: false, error: 'IDs invalides' };
  }
  if (file.size === 0) return { success: false, error: 'Fichier vide' };
  if (file.size > 25 * 1024 * 1024) {
    return { success: false, error: 'Fichier > 25 Mo' };
  }

  const apiKey = await getClientApiKey(clientId);
  const client = createEduviaQualityClient({
    apiKey: apiKey ?? undefined,
  });

  try {
    const bytes = await file.arrayBuffer();
    const evidence = await client.uploadEvidence(campusId, deliverableId, {
      name: file.name,
      type: file.type || 'application/octet-stream',
      bytes,
    });
    logAudit('qualiopi_evidence_upload', 'evidence', undefined, {
      evidence_id: evidence.id,
      deliverable_id: deliverableId,
    });
    revalidatePath(`/qualiopi`);
    return { success: true, evidenceId: evidence.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, 'uploadEvidence failed', { error: msg });
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Validation / rejet d'une preuve
// ---------------------------------------------------------------------------

export async function validateEvidence(params: {
  clientId: string;
  campusId: number;
  evidenceId: number;
  status: 'conform' | 'rejected';
  rejectionMotif?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (params.status === 'rejected') {
    const motif = params.rejectionMotif?.trim() ?? '';
    if (!motif) {
      return { success: false, error: 'Motif de rejet requis' };
    }
  }

  const apiKey = await getClientApiKey(params.clientId);
  const client = createEduviaQualityClient({
    apiKey: apiKey ?? undefined,
  });

  try {
    await client.updateEvidenceStatus(params.evidenceId, params.status);

    // Stocker le motif cote SOLUVIA tant qu'Eduvia n'expose pas le champ
    if (params.status === 'rejected' && params.rejectionMotif?.trim()) {
      await addEvidenceNote({
        clientId: params.clientId,
        campusId: params.campusId,
        evidenceId: params.evidenceId,
        kind: 'rejection',
        message: params.rejectionMotif.trim(),
      });
    }

    logAudit('qualiopi_evidence_status', 'evidence', undefined, {
      evidence_id: params.evidenceId,
      status: params.status,
    });
    revalidatePath(`/qualiopi`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(SCOPE, 'validateEvidence failed', { error: msg });
    return { success: false, error: msg };
  }
}
