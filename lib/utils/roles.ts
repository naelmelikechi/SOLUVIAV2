/**
 * Centralized role utilities.
 * Use `isAdmin()` everywhere instead of inline `role === 'admin'` checks.
 */

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'superadmin';
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
