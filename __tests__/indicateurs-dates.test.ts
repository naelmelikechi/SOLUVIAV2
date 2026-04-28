import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  getPeriodRange,
  getPreviousWeekRange,
  getTechRange,
} from '@/lib/queries/indicateurs';

describe('getPeriodRange', () => {
  it('week period returns Monday → Sunday spanning the reference date', () => {
    // 2026-04-29 is a Wednesday
    const ref = new Date('2026-04-29T12:00:00Z');
    const { start, end } = getPeriodRange('week', ref);
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
    expect(start.getTime()).toBeLessThanOrEqual(ref.getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(ref.getTime());
  });

  it('month period starts at first day of month and ends at reference', () => {
    const ref = new Date('2026-04-29T15:00:00Z');
    const { start, end } = getPeriodRange('month', ref);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(ref.getMonth());
    expect(end.getTime()).toBe(ref.getTime());
  });
});

describe('getPreviousWeekRange', () => {
  it('returns Monday → Sunday of the week before the reference', () => {
    // 2026-04-29 (Wed) → previous week starts Mon 2026-04-20 → Sun 2026-04-26
    const ref = new Date('2026-04-29T12:00:00Z');
    const { start, end } = getPreviousWeekRange(ref);
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
    const deltaDays = (ref.getTime() - end.getTime()) / (1000 * 60 * 60 * 24);
    // Sunday of previous week is 2 to 9 days before any midweek reference
    expect(deltaDays).toBeGreaterThan(2);
    expect(deltaDays).toBeLessThan(9);
  });
});

describe('getTechRange', () => {
  it('month period mirrors getPeriodRange month', () => {
    const ref = new Date('2026-04-29T15:00:00Z');
    const { start, end } = getTechRange('month', ref);
    expect(start.getDate()).toBe(1);
    expect(end.getTime()).toBe(ref.getTime());
  });

  it('cycle period spans roughly 14 days bookended by Monday → Sunday', () => {
    const ref = new Date('2026-04-29T12:00:00Z');
    const { start, end } = getTechRange('cycle', ref);
    const days = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(days).toBeGreaterThanOrEqual(13);
    expect(days).toBeLessThanOrEqual(14);
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
  });
});
