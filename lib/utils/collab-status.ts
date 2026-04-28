import { isAdmin, canAccessPipeline } from './roles';

export type CollabStatus =
  | 'admin'
  | 'commercial'
  | 'cdp_with_projects'
  | 'unassigned_collaborator';

/**
 * Pure derivation : meme logique cote server (lib/queries/collab-status.ts)
 * et cote client (DashboardLayout, Sidebar). Aucune dependance Supabase.
 */
export function deriveCollabStatus(
  role: string | null | undefined,
  pipelineAccess: boolean | null | undefined,
  projetsCount: number,
): CollabStatus {
  if (isAdmin(role)) return 'admin';
  if (role === 'commercial' || canAccessPipeline(role, pipelineAccess)) {
    return 'commercial';
  }
  return projetsCount > 0 ? 'cdp_with_projects' : 'unassigned_collaborator';
}

export function isUnassignedCollab(status: CollabStatus): boolean {
  return status === 'unassigned_collaborator';
}
