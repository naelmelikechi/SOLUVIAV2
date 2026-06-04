import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '@/lib/utils/concurrency';

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

describe('mapWithConcurrency', () => {
  it('préserve l’ordre des résultats (result[i] === fn(items[i]))', async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n) => {
      await delay(n % 2 === 0 ? 1 : 5); // ordre de complétion volontairement mélangé
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('traite tous les items', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4], 3, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('ne dépasse jamais la limite de concurrence', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      4,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await delay(2);
        inFlight--;
      },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // a bien parallélisé
  });

  it('renvoie un tableau vide pour des items vides (et n’appelle pas fn)', async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => {
      calls++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it('propage le rejet d’une tâche', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
