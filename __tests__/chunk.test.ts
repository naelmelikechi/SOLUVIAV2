import { describe, it, expect } from 'vitest';
import { chunk } from '@/lib/utils/chunk';

describe('chunk', () => {
  it('decoupe une liste en lots de taille bornee', () => {
    const arr = Array.from({ length: 450 }, (_, i) => i + 1);
    const lots = chunk(arr, 200);
    expect(lots.map((l) => l.length)).toEqual([200, 200, 50]);
    // La concatenation redonne l'entree dans l'ordre.
    expect(lots.flat()).toEqual(arr);
  });

  it('liste vide -> aucun lot', () => {
    expect(chunk([], 200)).toEqual([]);
  });

  it('liste plus petite que la taille -> un seul lot', () => {
    expect(chunk([1, 2, 3], 200)).toEqual([[1, 2, 3]]);
  });

  it('taille exacte multiple -> lots pleins', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('taille <= 0 -> throw (garde anti boucle infinie)', () => {
    expect(() => chunk([1, 2], 0)).toThrow(/chunk size/);
    expect(() => chunk([1, 2], -1)).toThrow(/chunk size/);
  });
});
