/**
 * Centralized role utilities.
 * Use these helpers everywhere instead of inline `role === 'admin'` checks.
 */

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin';
}

/**
 * Pipeline access is an attribute, not a role.
 * Admin and superadmin get it implicitly; other roles need pipeline_access=true.
 */
export function canAccessPipeline(
  role: string | null | undefined,
  pipelineAccess: boolean | null | undefined,
): boolean {
  return isAdmin(role) || pipelineAccess === true;
}

export function getRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'superadmin':
      return 'Superadmin';
    case 'admin':
      return 'Admin';
    case 'cdp':
      return 'CDP';
    default:
      return role ?? '';
  }
}
