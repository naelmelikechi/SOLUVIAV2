import { createClient } from '@/lib/supabase/server';
import { createEduviaQualityClient } from '@/lib/eduvia/quality-client';
import { baseUrlFrom } from '@/lib/eduvia/client';
import { decryptApiKey } from '@/lib/utils/encryption';
import { logger } from '@/lib/utils/logger';
import type {
  EduviaQualityClient,
  QualityCampus,
  QualityCriterion,
  QualityDeliverable,
  QualityDeliverableStatus,
  QualityEvidence,
  QualityIndicator,
} from '@/lib/eduvia/quality-types';

const SCOPE = 'queries.qualiopi';

// ---------------------------------------------------------------------------
// Resolution client + cle API
// ---------------------------------------------------------------------------

/**
 * Recupere la cle API Eduvia active pour un client (CFA).
 * Decryptee a la volee. Retourne null si pas de cle ou cle inactive.
 */
async function getClientApiCreds(
  clientId: string,
): Promise<{ apiKey: string; instanceUrl: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_api_keys')
    .select('api_key_encrypted, instance_url')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data || !data.instance_url) return null;
  try {
    return {
      apiKey: decryptApiKey(data.api_key_encrypted),
      instanceUrl: data.instance_url,
    };
  } catch (err) {
    logger.error(SCOPE, 'decryptApiKey failed', { clientId, error: err });
    return null;
  }
}

async function getQualityClient(
  clientId: string,
): Promise<EduviaQualityClient | null> {
  const creds = await getClientApiCreds(clientId);
  // Mode 'mock' explicite (dev / tests) : referentiel factice meme sans cle
  if (process.env.EDUVIA_QUALITY_API_MODE === 'mock') {
    return createEduviaQualityClient({ apiKey: creds?.apiKey });
  }
  // Sinon : real des qu'on a une cle + instance_url. Pas de cle = pas de client.
  if (!creds) return null;
  return createEduviaQualityClient({
    apiKey: creds.apiKey,
    baseUrl: baseUrlFrom(creds.instanceUrl),
    mode: 'real',
  });
}

// ---------------------------------------------------------------------------
// Listing CFA configures
// ---------------------------------------------------------------------------

export interface QualiopiClient {
  id: string;
  trigramme: string;
  raison_sociale: string;
  has_api_key: boolean;
}

export async function getQualiopiClients(): Promise<QualiopiClient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, trigramme, raison_sociale, archive, is_demo, api_keys:client_api_keys(is_active)',
    )
    .eq('archive', false)
    .order('raison_sociale');
  if (error) {
    logger.error(SCOPE, 'getQualiopiClients failed', { error });
    return [];
  }
  return (data ?? [])
    .filter((c) => c.id && c.id !== '00000000-0000-0000-0000-000000000001')
    .map((c) => {
      const keys = (c.api_keys as Array<{ is_active: boolean }>) ?? [];
      return {
        id: c.id,
        trigramme: c.trigramme,
        raison_sociale: c.raison_sociale,
        has_api_key: keys.some((k) => k.is_active),
      };
    });
}

export async function getClientByRef(
  trigramme: string,
): Promise<QualiopiClient | null> {
  const list = await getQualiopiClients();
  return list.find((c) => c.trigramme === trigramme) ?? null;
}

// ---------------------------------------------------------------------------
// Campus + referentiel + statuses (cache cote app)
// ---------------------------------------------------------------------------

export async function listCampusesForClient(
  clientId: string,
): Promise<QualityCampus[]> {
  const client = await getQualityClient(clientId);
  if (!client) return [];
  try {
    return await client.listCampuses();
  } catch (err) {
    logger.error(SCOPE, 'listCampuses failed', { clientId, error: err });
    return [];
  }
}

export async function getReferentiel(clientId: string): Promise<{
  criteria: QualityCriterion[];
  indicatorsByCriterion: Map<number, QualityIndicator[]>;
  deliverablesByIndicator: Map<number, QualityDeliverable[]>;
}> {
  const client = await getQualityClient(clientId);
  if (!client) {
    return {
      criteria: [],
      indicatorsByCriterion: new Map(),
      deliverablesByIndicator: new Map(),
    };
  }
  try {
    const criteria = await client.listCriteria();
    const indicatorsByCriterion = new Map<number, QualityIndicator[]>();
    const deliverablesByIndicator = new Map<number, QualityDeliverable[]>();

    // Charge tous les indicators/deliverables en parallele
    const indicatorsAll = await Promise.all(
      criteria.map((c) =>
        client.listIndicators(c.id).then((inds) => ({ id: c.id, inds })),
      ),
    );
    for (const { id, inds } of indicatorsAll) {
      indicatorsByCriterion.set(id, inds);
    }

    const allIndicators = indicatorsAll.flatMap((x) => x.inds);
    const deliverablesAll = await Promise.all(
      allIndicators.map((i) =>
        client.listDeliverables(i.id).then((delivs) => ({ id: i.id, delivs })),
      ),
    );
    for (const { id, delivs } of deliverablesAll) {
      deliverablesByIndicator.set(id, delivs);
    }

    return { criteria, indicatorsByCriterion, deliverablesByIndicator };
  } catch (err) {
    logger.error(SCOPE, 'getReferentiel failed', { clientId, error: err });
    return {
      criteria: [],
      indicatorsByCriterion: new Map(),
      deliverablesByIndicator: new Map(),
    };
  }
}

export async function getDeliverableStatuses(
  clientId: string,
  campusId: number,
): Promise<QualityDeliverableStatus[]> {
  const client = await getQualityClient(clientId);
  if (!client) return [];
  try {
    return await client.listDeliverableStatuses(campusId);
  } catch (err) {
    logger.error(SCOPE, 'getDeliverableStatuses failed', {
      clientId,
      campusId,
      error: err,
    });
    return [];
  }
}

export async function getEvidences(
  clientId: string,
  campusId: number,
  deliverableId: number,
): Promise<QualityEvidence[]> {
  const client = await getQualityClient(clientId);
  if (!client) return [];
  try {
    return await client.listEvidences(campusId, deliverableId);
  } catch (err) {
    logger.error(SCOPE, 'getEvidences failed', {
      clientId,
      campusId,
      deliverableId,
      error: err,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Donnees SOLUVIA-side (assignations + notes evidence)
// ---------------------------------------------------------------------------

export interface QualiopiAssignment {
  campus_id: number;
  indicator_id: number;
  user: { id: string; prenom: string; nom: string } | null;
}

export async function getAssignments(
  clientId: string,
  campusId: number,
): Promise<Map<number, QualiopiAssignment>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('qualite_assignments')
    .select(
      'indicator_id, campus_id, user:users!qualite_assignments_user_id_fkey(id, prenom, nom)',
    )
    .eq('client_id', clientId)
    .eq('campus_id', campusId);
  if (error || !data) {
    logger.error(SCOPE, 'getAssignments failed', { clientId, campusId, error });
    return new Map();
  }
  const out = new Map<number, QualiopiAssignment>();
  for (const row of data) {
    out.set(row.indicator_id, {
      campus_id: row.campus_id,
      indicator_id: row.indicator_id,
      user: (row.user as unknown as QualiopiAssignment['user']) ?? null,
    });
  }
  return out;
}

export interface EvidenceNote {
  id: string;
  evidence_id: number;
  kind: 'rejection' | 'note';
  message: string;
  author: { id: string; prenom: string; nom: string } | null;
  created_at: string;
}

export async function getEvidenceNotes(
  clientId: string,
  evidenceIds: number[],
): Promise<Map<number, EvidenceNote[]>> {
  if (evidenceIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('qualite_evidence_notes')
    .select(
      'id, evidence_id, kind, message, created_at, author:users!qualite_evidence_notes_author_id_fkey(id, prenom, nom)',
    )
    .eq('client_id', clientId)
    .in('evidence_id', evidenceIds)
    .order('created_at', { ascending: false });
  if (error || !data) {
    logger.error(SCOPE, 'getEvidenceNotes failed', { clientId, error });
    return new Map();
  }
  const out = new Map<number, EvidenceNote[]>();
  for (const row of data) {
    const arr = out.get(row.evidence_id) ?? [];
    arr.push({
      id: row.id,
      evidence_id: row.evidence_id,
      kind: row.kind as 'rejection' | 'note',
      message: row.message,
      author: (row.author as unknown as EvidenceNote['author']) ?? null,
      created_at: row.created_at,
    });
    out.set(row.evidence_id, arr);
  }
  return out;
}
