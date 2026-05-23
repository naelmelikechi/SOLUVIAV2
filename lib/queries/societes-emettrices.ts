import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

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
