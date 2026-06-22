import { describe, it, expect } from 'vitest';
import { resolveAccueilView } from '@/lib/utils/accueil-routing';
import { businessDaysElapsedThisWeek } from '@/lib/utils/dates';

describe('resolveAccueilView', () => {
  it('admin -> superadmin (même avec des projets)', () => {
    expect(
      resolveAccueilView({ isAdmin: true, projetsCount: 0, status: 'admin' }),
    ).toBe('superadmin');
    expect(
      resolveAccueilView({
        isAdmin: true,
        projetsCount: 5,
        status: 'cdp_with_projects',
      }),
    ).toBe('superadmin');
  });

  it('CDP avec projets -> cdp, même classé commercial (pipeline_access)', () => {
    expect(
      resolveAccueilView({
        isAdmin: false,
        projetsCount: 3,
        status: 'commercial',
      }),
    ).toBe('cdp');
    expect(
      resolveAccueilView({
        isAdmin: false,
        projetsCount: 1,
        status: 'cdp_with_projects',
      }),
    ).toBe('cdp');
  });

  it('commercial pur sans projet -> commercial', () => {
    expect(
      resolveAccueilView({
        isAdmin: false,
        projetsCount: 0,
        status: 'commercial',
      }),
    ).toBe('commercial');
  });

  it('sans projet ni rôle -> onboarding', () => {
    expect(
      resolveAccueilView({
        isAdmin: false,
        projetsCount: 0,
        status: 'unassigned_collaborator',
      }),
    ).toBe('onboarding');
  });
});

describe('businessDaysElapsedThisWeek', () => {
  // 2026-06-22 = lundi (dates en composantes locales pour rester TZ-stable).
  it('lundi -> 1, vendredi -> 5', () => {
    expect(businessDaysElapsedThisWeek(new Date(2026, 5, 22))).toBe(1);
    expect(businessDaysElapsedThisWeek(new Date(2026, 5, 26))).toBe(5);
  });

  it('samedi/dimanche -> 5 (semaine pleine)', () => {
    expect(businessDaysElapsedThisWeek(new Date(2026, 5, 27))).toBe(5);
    expect(businessDaysElapsedThisWeek(new Date(2026, 5, 28))).toBe(5);
  });
});
