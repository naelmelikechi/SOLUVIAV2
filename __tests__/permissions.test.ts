import { describe, it, expect } from 'vitest';
import {
  canManageUser,
  canAssignRole,
  canInviteRole,
  canDeleteUser,
  canResetUserCredentials,
} from '@/lib/auth/permissions';

describe('canManageUser', () => {
  it('superadmin peut gerer tout le monde', () => {
    expect(canManageUser('superadmin', 'cdp')).toBe(true);
    expect(canManageUser('superadmin', 'admin')).toBe(true);
    expect(canManageUser('superadmin', 'superadmin')).toBe(true);
    expect(canManageUser('superadmin', 'commercial')).toBe(true);
  });

  it('admin peut gerer cdp et commercial mais pas admin/superadmin', () => {
    expect(canManageUser('admin', 'cdp')).toBe(true);
    expect(canManageUser('admin', 'commercial')).toBe(true);
    expect(canManageUser('admin', 'admin')).toBe(false);
    expect(canManageUser('admin', 'superadmin')).toBe(false);
  });

  it('cdp ne peut rien gerer', () => {
    expect(canManageUser('cdp', 'cdp')).toBe(false);
    expect(canManageUser(null, 'cdp')).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('personne ne peut assigner superadmin via UI', () => {
    expect(canAssignRole('superadmin', 'superadmin')).toBe(false);
    expect(canAssignRole('admin', 'superadmin')).toBe(false);
  });

  it('superadmin assigne admin/cdp/commercial', () => {
    expect(canAssignRole('superadmin', 'admin')).toBe(true);
    expect(canAssignRole('superadmin', 'cdp')).toBe(true);
    expect(canAssignRole('superadmin', 'commercial')).toBe(true);
  });

  it('admin assigne seulement cdp/commercial', () => {
    expect(canAssignRole('admin', 'cdp')).toBe(true);
    expect(canAssignRole('admin', 'commercial')).toBe(true);
    expect(canAssignRole('admin', 'admin')).toBe(false);
  });

  it('cdp ne peut rien assigner', () => {
    expect(canAssignRole('cdp', 'cdp')).toBe(false);
  });
});

describe('canInviteRole', () => {
  it('alias semantique de canAssignRole', () => {
    expect(canInviteRole('admin', 'cdp')).toBe(true);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('superadmin', 'admin')).toBe(true);
  });
});

describe('canDeleteUser', () => {
  it('reserve aux superadmins', () => {
    expect(canDeleteUser('superadmin')).toBe(true);
    expect(canDeleteUser('admin')).toBe(false);
    expect(canDeleteUser('cdp')).toBe(false);
    expect(canDeleteUser(null)).toBe(false);
  });
});

describe('canResetUserCredentials', () => {
  it('memes regles que canManageUser', () => {
    expect(canResetUserCredentials('superadmin', 'admin')).toBe(true);
    expect(canResetUserCredentials('admin', 'cdp')).toBe(true);
    expect(canResetUserCredentials('admin', 'admin')).toBe(false);
    expect(canResetUserCredentials('cdp', 'cdp')).toBe(false);
  });
});
