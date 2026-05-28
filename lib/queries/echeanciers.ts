import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export interface EcheancierTemplate {
  id: string;
  nom: string;
  description: string | null;
  jalons: unknown;
  is_default: boolean;
  archive: boolean;
}

export async function listEcheancierTemplates(): Promise<EcheancierTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('echeanciers_templates')
    .select('id, nom, description, jalons, is_default, archive')
    .eq('archive', false)
    .order('nom');
  if (error) {
    logger.error('queries.echeanciers', 'list templates failed', { error });
    return [];
  }
  return data ?? [];
}
