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
    const deliverablesRaw = new Map<number, QualityDeliverable[]>();
    for (const { id, delivs } of deliverablesAll) {
      deliverablesRaw.set(id, delivs);
    }

    // Dedup global avec heuristique de prefixe.
    //
    // Cas reels observes sur HEOL :
    //  - LIV-C1-100 (id=21) est expose sous IND-01, IND-02 et IND-03 du
    //    criterion C1. SOLUVIA le comptait 3 fois (3 livrables) la ou Eduvia
    //    UI l'attribue a IND-01 seulement.
    //  - LIV-HQ-PSH-002 (id=103) est expose sous IND-26 (criterion C6) ET
    //    sous IND-HQ-01 (criterion HQ). Eduvia UI l'attribue a HQ.
    //
    // L'API publique Eduvia ne donne aucun champ "primary criterion/indicator"
    // (objet retourne strictement {id, code, title, recurrence, indicator_id}).
    // On utilise donc le prefixe du code livrable (`LIV-{PREFIX}-...`) pour
    // determiner le criterion proprietaire : LIV-HQ-* -> HQ, LIV-C6-* -> C6.
    // Si le prefixe ne matche aucun criterion, on retombe sur first-wins.
    //
    // Resultat : total et repartition par criterion identiques a l'UI Eduvia.
    const criterionByPrefix = new Map(criteria.map((c) => [c.prefix, c.id]));
    const ownerCriterionId = (code: string): number | null => {
      const parts = code.split('-');
      if (parts.length < 2) return null;
      return criterionByPrefix.get(parts[1]!) ?? null;
    };
    const seen = new Set<number>();
    for (const c of criteria) {
      const inds = indicatorsByCriterion.get(c.id) ?? [];
      for (const i of inds) {
        const raw = deliverablesRaw.get(i.id) ?? [];
        const unique: QualityDeliverable[] = [];
        for (const d of raw) {
          if (seen.has(d.id)) continue;
          // Si le code identifie un proprietaire different du criterion en
          // cours, on saute : le livrable sera attribue a son criterion natif
          // quand l'iteration y arrivera.
          const owner = ownerCriterionId(d.code);
          if (owner !== null && owner !== c.id) continue;
          seen.add(d.id);
          unique.push(d);
        }
        deliverablesByIndicator.set(i.id, unique);
      }
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
