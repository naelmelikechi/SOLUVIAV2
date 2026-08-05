import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { ProposalKind, ProposalStatus } from '@/lib/brain/proposal';

export interface ProposalRow {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
  reason: string | null;
  created_at: string;
}

/** Propositions à arbitrer, les plus anciennes d'abord (FIFO). */
export async function getPendingProposals(): Promise<ProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brain_proposals')
    .select(
      'id, kind, status, target_path, payload, source_ref, source_hash, reason, created_at',
    )
    .eq('status', 'en_attente')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    logger.error('queries.brain-proposals', 'getPendingProposals failed', {
      error,
    });
    throw error;
  }
  return (data ?? []) as ProposalRow[];
}

/** Compteurs par kind, pour les titres de section. */
export async function getPendingCounts(): Promise<Record<string, number>> {
  const rows = await getPendingProposals();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
