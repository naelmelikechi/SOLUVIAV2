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

export function isCommercial(role: string | null | undefined): boolean {
  return role === 'commercial';
}

export function canAccessPipeline(role: string | null | undefined): boolean {
  return isAdmin(role) || isCommercial(role);
}

export function getRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'superadmin':
      return 'Superadmin';
    case 'admin':
      return 'Admin';
    case 'cdp':
      return 'CDP';
    case 'commercial':
      return 'Commercial';
    default:
      return role ?? '';
  }
}
