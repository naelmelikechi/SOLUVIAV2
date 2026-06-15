import { describe, it, expect, vi } from 'vitest';
import { withClockSkewRetry } from '@/lib/supabase/clock-skew-retry';

type Res = {
  data: number[] | null;
  error: { code: string; message: string } | null;
};

const ok: Res = { data: [1, 2], error: null };
const skew: Res = {
  data: null,
  error: { code: 'PGRST303', message: 'JWT issued at future' },
};
const other: Res = {
  data: null,
  error: { code: 'PGRST116', message: 'no rows' },
};

describe('withClockSkewRetry', () => {
  it('ne rejoue pas quand la requête réussit', async () => {
    const run = vi.fn<() => Promise<Res>>().mockResolvedValue(ok);
    const r = await withClockSkewRetry(run, [1, 1]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r).toBe(ok);
  });

  it('rejoue sur PGRST303 puis renvoie le succès', async () => {
    const run = vi
      .fn<() => Promise<Res>>()
      .mockResolvedValueOnce(skew)
      .mockResolvedValueOnce(ok);
    const r = await withClockSkewRetry(run, [1, 1]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r).toBe(ok);
  });

  it("abandonne après tous les délais si PGRST303 persiste (l'appelant gère l'erreur)", async () => {
    const run = vi.fn<() => Promise<Res>>().mockResolvedValue(skew);
    const r = await withClockSkewRetry(run, [1, 1]);
    expect(run).toHaveBeenCalledTimes(3); // 1 essai + 2 retries
    expect(r).toBe(skew);
  });

  it('ne rejoue jamais sur une autre erreur', async () => {
    const run = vi.fn<() => Promise<Res>>().mockResolvedValue(other);
    const r = await withClockSkewRetry(run, [1, 1]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r).toBe(other);
  });
});
