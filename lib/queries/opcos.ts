import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { OpcoMapping, OpcoInfo } from '@/lib/opco/resolve';

export interface OpcoRow {
  id: string;
  code: string;
  nom: string;
  prefixes_deca: string[];
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Charge tous les OPCO actifs et construit le Map prefixe -> OPCO.
 * Si un prefixe est partage entre 2 OPCO actifs (config invalide), premier
 * match wins + warning logger. La validation cote action est censee empecher
 * cette situation.
 */
export async function getActiveOpcoMapping(): Promise<OpcoMapping> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opcos')
    .select('code, nom, prefixes_deca')
    .eq('actif', true);

  if (error) {
    logger.error('queries.opcos', 'getActiveOpcoMapping failed', { error });
    return new Map();
  }

  const mapping: OpcoMapping = new Map();
  for (const opco of data ?? []) {
    const info: OpcoInfo = { code: opco.code, nom: opco.nom };
    for (const prefix of opco.prefixes_deca ?? []) {
      if (mapping.has(prefix)) {
        logger.warn(
          'queries.opcos',
          'prefixe DECA partage entre deux OPCO actifs',
          {
            prefix,
            existant: mapping.get(prefix)?.code,
            nouveau: opco.code,
          },
        );
        continue;
      }
      mapping.set(prefix, info);
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
