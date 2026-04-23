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

/**
 * Validating / rejecting ideas is admin-only.
 * The `_canValidateFlag` parameter is kept for backwards compatibility
 * with existing callers but its value is ignored.
 */
export function canValidateIdeas(
  role: string | null | undefined,
  _canValidateFlag?: boolean | null | undefined,
): boolean {
  return isAdmin(role);
}

export function canShipIdeas(
  role: string | null | undefined,
  canShipFlag: boolean | null | undefined,
): boolean {
  return isAdmin(role) || canShipFlag === true;
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
