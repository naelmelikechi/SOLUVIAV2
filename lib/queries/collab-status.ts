import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import {
  deriveCollabStatus,
  type CollabStatus,
} from '@/lib/utils/collab-status';

export type { CollabStatus } from '@/lib/utils/collab-status';
export { isUnassignedCollab } from '@/lib/utils/collab-status';

export type CollabStatusInfo = {
  status: CollabStatus;
  role: string | null;
  pipelineAccess: boolean;
  projetsCount: number;
};

/**
 * Determine how a user fits in the system, to decide UI gating
 * (onboarding banner, /accueil entry, billable KPI).
 *
 * - admin / superadmin -> 'admin'
 * - role=commercial OR pipeline_access=true -> 'commercial'
 * - cdp with at least one non-internal active project -> 'cdp_with_projects'
 * - else -> 'unassigned_collaborator'
 */
export async function getCollabStatus(
  userId: string,
): Promise<CollabStatusInfo> {
  const supabase = await createClient();

  const userResult = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', userId)
    .single();

  if (userResult.error || !userResult.data) {
    logger.error(
      'queries.collab-status',
      'getCollabStatus user lookup failed',
      {
        error: userResult.error,
        userId,
      },
    );
    return {
      status: 'unassigned_collaborator',
      role: null,
      pipelineAccess: false,
      projetsCount: 0,
    };
  }

  const role = userResult.data.role;
  const pipelineAccess = userResult.data.pipeline_access ?? false;

  const projetsResult = await supabase
    .from('projets')
    .select('id', { count: 'exact', head: true })
    .eq('archive', false)
    .eq('est_interne', false)
    .or(`cdp_id.eq.${userId},backup_cdp_id.eq.${userId}`);

  const projetsCount = projetsResult.count ?? 0;

  return {
    status: deriveCollabStatus(role, pipelineAccess, projetsCount),
    role,
    pipelineAccess,
    projetsCount,
  };
}
