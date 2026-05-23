import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type SocieteEmettriceRow =
  Database['public']['Tables']['societes_emettrices']['Row'];

export async function listSocietesEmettrices(): Promise<SocieteEmettriceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .order('est_defaut', { ascending: false })
    .order('code');
  if (error) {
    logger.error('queries.societes_emettrices', 'list failed', { error });
    throw new AppError(
      'SOCIETES_EMETTRICES_FETCH_FAILED',
      'Impossible de charger les societes emettrices',
      { cause: error },
    );
  }
  return data;
}

export async function listSocietesEmettricesActives(): Promise<
  SocieteEmettriceRow[]
> {
  const all = await listSocietesEmettrices();
  return all.filter((s) => s.actif);
}

export async function getSocieteEmettriceById(
  id: string,
): Promise<SocieteEmettriceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('queries.societes_emettrices', 'getById failed', {
      id,
      error,
    });
    throw new AppError(
      'SOCIETES_EMETTRICES_FETCH_FAILED',
      `Impossible de charger la societe emettrice ${id}`,
      { cause: error },
    );
  }
  return data;
}

export async function getDefaultSocieteEmettrice(): Promise<SocieteEmettriceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .eq('est_defaut', true)
    .eq('actif', true)
    .maybeSingle();
  if (error) {
    logger.error('queries.societes_emettrices', 'getDefault failed', { error });
    return null;
  }
  return data;
}

// Keep the lightweight ID-only helper used by lib/actions/factures
// (Task 2 introduced it before the full module existed).
export async function getDefaultSocieteEmettriceId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('id')
    .eq('est_defaut', true)
    .eq('actif', true)
    .maybeSingle();
  if (error || !data) {
    logger.error('queries.societes_emettrices', 'getDefault failed', { error });
    throw new AppError(
      'SOCIETE_EMETTRICE_DEFAULT_MISSING',
      'Aucune societe emettrice par defaut active',
      { cause: error },
    );
  }
  return data.id;
}
