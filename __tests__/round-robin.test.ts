import { describe, it, expect } from 'vitest';
import { nextRoundRobinDeveloppeur } from '@/lib/utils/round-robin';

describe('nextRoundRobinDeveloppeur', () => {
  it('renvoie null quand aucun développeur éligible', () => {
    expect(nextRoundRobinDeveloppeur([], {})).toBeNull();
    expect(nextRoundRobinDeveloppeur([], { a: 3 })).toBeNull();
  });

  it('choisit le développeur le moins chargé (équité)', () => {
    expect(
      nextRoundRobinDeveloppeur(['a', 'b', 'c'], { a: 5, b: 2, c: 9 }),
    ).toBe('b');
  });

  it('traite une charge absente comme 0 (dev jamais affecté prioritaire)', () => {
    expect(nextRoundRobinDeveloppeur(['a', 'b'], { a: 3 })).toBe('b');
    expect(nextRoundRobinDeveloppeur(['a', 'b', 'c'], { b: 1 })).toBe('a');
  });

  it('départage les charges égales de façon déterministe (ordre de devIds)', () => {
    expect(nextRoundRobinDeveloppeur(['a', 'b', 'c'], {})).toBe('a');
    expect(nextRoundRobinDeveloppeur(['x', 'y'], { x: 4, y: 4 })).toBe('x');
    // L'ordre de devIds prime, pas l'ordre alphabétique.
    expect(nextRoundRobinDeveloppeur(['y', 'x'], { x: 4, y: 4 })).toBe('y');
  });

  it('distribue équitablement sur plusieurs tours successifs', () => {
    const devs = ['a', 'b', 'c'];
    const charge: Record<string, number> = {};
    const picks: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = nextRoundRobinDeveloppeur(devs, charge);
      expect(next).not.toBeNull();
      if (next) {
        picks.push(next);
        charge[next] = (charge[next] ?? 0) + 1;
      }
    }
    // 6 leads répartis sur 3 développeurs → 2 chacun.
    expect(picks.filter((p) => p === 'a')).toHaveLength(2);
    expect(picks.filter((p) => p === 'b')).toHaveLength(2);
    expect(picks.filter((p) => p === 'c')).toHaveLength(2);
  });

  it('ignore les charges des développeurs hors liste éligible', () => {
    // 'z' n'est pas éligible : sa charge n'influence pas le choix.
    expect(nextRoundRobinDeveloppeur(['a', 'b'], { a: 2, b: 1, z: 0 })).toBe(
      'b',
    );
  });
});
