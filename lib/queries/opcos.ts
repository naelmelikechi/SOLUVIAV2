import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import {
  normalizeIdcc,
  type OpcoMapping,
  type OpcoInfo,
} from '@/lib/opco/resolve';

export interface OpcoRow {
  id: string;
  code: string;
  nom: string;
  idcc_codes: string[];
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Charge tous les OPCO actifs et construit le Map IDCC -> OPCO. L'IDCC
 * (convention collective) est le seul déterminant légal et 1:1 de l'OPCO.
 * Si un IDCC est partagé entre 2 OPCO actifs (config invalide), premier match
 * wins + warning logger. La validation côté action est censée empêcher ça.
 */
export async function getActiveOpcoMapping(): Promise<OpcoMapping> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opcos')
    .select('code, nom, idcc_codes')
    .eq('actif', true);

  if (error) {
    logger.error('queries.opcos', 'getActiveOpcoMapping failed', { error });
    return new Map();
  }

  const mapping: OpcoMapping = new Map();
  for (const opco of data ?? []) {
    const info: OpcoInfo = { code: opco.code, nom: opco.nom };
    for (const idccRaw of opco.idcc_codes ?? []) {
      const idcc = normalizeIdcc(idccRaw);
      if (!idcc) continue;
      if (mapping.has(idcc)) {
        logger.warn('queries.opcos', 'IDCC partagé entre deux OPCO actifs', {
          idcc,
          existant: mapping.get(idcc)?.code,
          nouveau: opco.code,
        });
        continue;
      }
      mapping.set(idcc, info);
    }
  }
  return mapping;
}

export async function listOpcos(includeArchived = false): Promise<OpcoRow[]> {
  const supabase = await createClient();
  const baseQuery = supabase.from('opcos').select('*').order('code');
  const { data, error } = includeArchived
    ? await baseQuery
    : await baseQuery.eq('actif', true);
  if (error) {
    logger.error('queries.opcos', 'listOpcos failed', { error });
    return [];
  }
  return (data ?? []) as OpcoRow[];
}
