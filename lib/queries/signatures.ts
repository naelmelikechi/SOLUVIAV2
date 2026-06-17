import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type SignatureRequest =
  Database['public']['Tables']['signature_requests']['Row'];

export type SignatureRequestWithInitiator = SignatureRequest & {
  initiator: { nom: string; prenom: string } | null;
};

export async function getSignatureRequestsByProspect(
  prospectId: string,
): Promise<SignatureRequestWithInitiator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('signature_requests')
    .select(
      '*, initiator:users!signature_requests_initiated_by_fkey(nom, prenom)',
    )
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(
      'queries.signatures',
      'getSignatureRequestsByProspect failed',
      {
        prospectId,
        error,
      },
    );
    return [];
  }
  return (data ?? []) as SignatureRequestWithInitiator[];
}
