import { describe, it, expect } from 'vitest';
import {
  isAdmin,
  isSuperAdmin,
  canAccessPipeline,
  canValidateIdeas,
  canShipIdeas,
  getRoleLabel,
} from '@/lib/utils/roles';

describe('isAdmin', () => {
  it('matches admin and superadmin', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('superadmin')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isAdmin('cdp')).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin('Admin')).toBe(false); // case sensitive
  });
});

describe('isSuperAdmin', () => {
  it('matches only superadmin', () => {
    expect(isSuperAdmin('superadmin')).toBe(true);
    expect(isSuperAdmin('admin')).toBe(false);
  });
});

describe('canAccessPipeline', () => {
  it('admins always pass regardless of flag', () => {
    expect(canAccessPipeline('admin', false)).toBe(true);
    expect(canAccessPipeline('admin', null)).toBe(true);
    expect(canAccessPipeline('superadmin', false)).toBe(true);
  });
  it('non-admins need explicit pipeline_access=true', () => {
    expect(canAccessPipeline('cdp', true)).toBe(true);
    expect(canAccessPipeline('cdp', false)).toBe(false);
    expect(canAccessPipeline('cdp', null)).toBe(false);
  });
});

describe('canValidateIdeas', () => {
  it('is admin-only and ignores the legacy flag', () => {
    expect(canValidateIdeas('admin')).toBe(true);
    expect(canValidateIdeas('superadmin', true)).toBe(true);
    expect(canValidateIdeas('cdp', true)).toBe(false); // flag ignored
    expect(canValidateIdeas(null)).toBe(false);
  });
});

describe('canShipIdeas', () => {
  it('admins always pass', () => {
    expect(canShipIdeas('admin', false)).toBe(true);
    expect(canShipIdeas('superadmin', null)).toBe(true);
  });
  it('non-admins need explicit can_ship=true', () => {
    expect(canShipIdeas('cdp', true)).toBe(true);
    expect(canShipIdeas('cdp', false)).toBe(false);
  });
});

describe('getRoleLabel', () => {
  it('maps known roles to their French label', () => {
    expect(getRoleLabel('superadmin')).toBe('Superadmin');
    expect(getRoleLabel('admin')).toBe('Admin');
    expect(getRoleLabel('cdp')).toBe('CDP');
  });
  it('returns the raw role string for unknown values, empty for null', () => {
    expect(getRoleLabel('weird')).toBe('weird');
    expect(getRoleLabel(null)).toBe('');
    expect(getRoleLabel(undefined)).toBe('');
  });
});
