import { describe, it, expect } from 'vitest';
import { resolvePeriode, type PeriodeKey } from '@/lib/utils/dashboard-periode';

describe('resolvePeriode', () => {
  const ref = new Date('2026-05-12T10:00:00Z');

  it('returns first/last day of current month for ce_mois', () => {
    const r = resolvePeriode('ce_mois', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-05-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-05-31');
    expect(r.label).toBe('Mai 2026');
  });

  it('returns previous month for mois_precedent', () => {
    const r = resolvePeriode('mois_precedent', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-04-30');
    expect(r.label).toBe('Avril 2026');
  });

  it('returns 30 days rolling window for 30j', () => {
    const r = resolvePeriode('30j', ref);
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-05-12');
    expect(r.label).toBe('30 derniers jours');
  });

  it('defaults to ce_mois for unknown key', () => {
    const r = resolvePeriode('garbage' as PeriodeKey, ref);
    expect(r.label).toBe('Mai 2026');
  });
});
