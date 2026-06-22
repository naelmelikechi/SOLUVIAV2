import { describe, it, expect } from 'vitest';
import type { LucideIcon } from 'lucide-react';
import {
  canAccessNavItem,
  canAccessIndicateurs,
  navSections,
  adminNavItems,
  allNavItems,
  type NavItem,
} from '@/components/layout/nav-config';

const ICON = (() => null) as unknown as LucideIcon;
const base: NavItem = { href: '/x', label: 'X', icon: ICON };

const ADMIN = { role: 'admin' };
const SUPERADMIN = { role: 'superadmin' };
const CDP = { role: 'cdp' };
const CDP_REFERENT = { role: 'cdp', referent_cdp: true };
const CDP_PIPELINE = { role: 'cdp', pipeline_access: true };
const COMMERCIAL = { role: 'commercial', pipeline_access: true };
const UNASSIGNED = { role: 'collaborateur' };

describe('canAccessNavItem', () => {
  it('item sans gating : visible par tous', () => {
    for (const u of [ADMIN, CDP, COMMERCIAL, UNASSIGNED]) {
      expect(canAccessNavItem(base, u)).toBe(true);
    }
  });

  it('adminOnly : admin/superadmin uniquement', () => {
    const item = { ...base, adminOnly: true };
    expect(canAccessNavItem(item, ADMIN)).toBe(true);
    expect(canAccessNavItem(item, SUPERADMIN)).toBe(true);
    expect(canAccessNavItem(item, CDP)).toBe(false);
    expect(canAccessNavItem(item, COMMERCIAL)).toBe(false);
    expect(canAccessNavItem(item, UNASSIGNED)).toBe(false);
  });

  it('requiresPipelineAccess : admin + porteurs pipeline_access', () => {
    const item = { ...base, requiresPipelineAccess: true };
    expect(canAccessNavItem(item, ADMIN)).toBe(true);
    expect(canAccessNavItem(item, COMMERCIAL)).toBe(true);
    expect(canAccessNavItem(item, CDP_PIPELINE)).toBe(true);
    expect(canAccessNavItem(item, CDP)).toBe(false);
    expect(canAccessNavItem(item, UNASSIGNED)).toBe(false);
  });

  it('requiresReferentCdp : admin + referent_cdp', () => {
    const item = { ...base, requiresReferentCdp: true };
    expect(canAccessNavItem(item, ADMIN)).toBe(true);
    expect(canAccessNavItem(item, CDP_REFERENT)).toBe(true);
    expect(canAccessNavItem(item, CDP)).toBe(false);
    expect(canAccessNavItem(item, COMMERCIAL)).toBe(false);
  });

  it('requiresCdpOrAdmin : admin + tout cdp (referent ou non)', () => {
    const item = { ...base, requiresCdpOrAdmin: true };
    expect(canAccessNavItem(item, ADMIN)).toBe(true);
    expect(canAccessNavItem(item, CDP)).toBe(true);
    expect(canAccessNavItem(item, CDP_PIPELINE)).toBe(true);
    expect(canAccessNavItem(item, COMMERCIAL)).toBe(false);
    expect(canAccessNavItem(item, UNASSIGNED)).toBe(false);
  });

  it('requiresIndicateursAccess : admin + cdp + pipeline_access', () => {
    const item = { ...base, requiresIndicateursAccess: true };
    expect(canAccessNavItem(item, ADMIN)).toBe(true);
    expect(canAccessNavItem(item, CDP)).toBe(true);
    expect(canAccessNavItem(item, COMMERCIAL)).toBe(true);
    expect(canAccessNavItem(item, UNASSIGNED)).toBe(false);
  });
});

describe('canAccessIndicateurs', () => {
  it('admin / cdp / pipeline_access => true ; sinon false', () => {
    expect(canAccessIndicateurs('admin', false)).toBe(true);
    expect(canAccessIndicateurs('cdp', false)).toBe(true);
    expect(canAccessIndicateurs('commercial', true)).toBe(true);
    expect(canAccessIndicateurs('collaborateur', false)).toBe(false);
  });
});

describe('nav-config structure', () => {
  it('allNavItems = sections + admin, hrefs uniques', () => {
    const fromSections = navSections.flatMap((s) => s.items);
    expect(allNavItems).toHaveLength(
      fromSections.length + adminNavItems.length,
    );
    const hrefs = allNavItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('inclut les routes récentes /accueil et /a-facturer', () => {
    const hrefs = allNavItems.map((i) => i.href);
    expect(hrefs).toContain('/accueil');
    expect(hrefs).toContain('/a-facturer');
  });
});
