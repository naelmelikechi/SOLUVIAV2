import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  todayIso,
  dailySeed,
  resolveAvatarSeed,
  canRollRandomToday,
  dicebearUrl,
} from '@/lib/utils/avatar';

describe('todayIso', () => {
  it('format YYYY-MM-DD avec mois et jour zero-paddes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-09T10:00:00'));
    expect(todayIso()).toBe('2026-01-09');
    vi.setSystemTime(new Date('2026-12-31T23:59:59'));
    expect(todayIso()).toBe('2026-12-31');
    vi.useRealTimers();
  });
});

describe('dailySeed', () => {
  it('format email|YYYY-MM-DD', () => {
    expect(dailySeed('user@example.com', '2026-05-11')).toBe(
      'user@example.com|2026-05-11',
    );
  });
});

describe('resolveAvatarSeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('frozen + seed -> mode=frozen, seed inchangee', () => {
    const result = resolveAvatarSeed({
      email: 'x@y.com',
      mode: 'frozen',
      seed: 'my-frozen-seed',
      regenDate: null,
    });
    expect(result).toEqual({
      effectiveMode: 'frozen',
      seed: 'my-frozen-seed',
    });
  });

  it('random + seed + regenDate=today -> mode=random', () => {
    const result = resolveAvatarSeed({
      email: 'x@y.com',
      mode: 'random',
      seed: 'roll-of-the-day',
      regenDate: '2026-05-11',
    });
    expect(result).toEqual({
      effectiveMode: 'random',
      seed: 'roll-of-the-day',
    });
  });

  it('random + regenDate != today -> fallback daily', () => {
    const result = resolveAvatarSeed({
      email: 'x@y.com',
      mode: 'random',
      seed: 'stale-roll',
      regenDate: '2026-05-10',
    });
    expect(result.effectiveMode).toBe('daily');
    expect(result.seed).toBe('x@y.com|2026-05-11');
  });

  it('mode null -> daily', () => {
    const result = resolveAvatarSeed({
      email: 'x@y.com',
      mode: null,
      seed: null,
      regenDate: null,
    });
    expect(result.effectiveMode).toBe('daily');
    expect(result.seed).toBe('x@y.com|2026-05-11');
  });

  it('frozen sans seed -> fallback daily (safe)', () => {
    const result = resolveAvatarSeed({
      email: 'x@y.com',
      mode: 'frozen',
      seed: null,
      regenDate: null,
    });
    expect(result.effectiveMode).toBe('daily');
  });
});

describe('canRollRandomToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('vrai si jamais roll (null)', () => {
    expect(canRollRandomToday(null)).toBe(true);
  });

  it('faux si deja roll aujourd hui', () => {
    expect(canRollRandomToday('2026-05-11')).toBe(false);
  });

  it('vrai si roll d hier', () => {
    expect(canRollRandomToday('2026-05-10')).toBe(true);
  });
});

describe('dicebearUrl', () => {
  it('URL avec seed encode + radius=50', () => {
    const url = dicebearUrl('user@example.com');
    expect(url).toBe(
      'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=user%40example.com&radius=50',
    );
  });

  it('ajoute size si fourni', () => {
    const url = dicebearUrl('seed', 128);
    expect(url).toContain('&size=128');
  });
});
