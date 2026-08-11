import { describe, expect, it } from 'vitest';
import { aggregateValues, formatAggregate } from '@/lib/utils/table-aggregates';

describe('aggregateValues', () => {
  it('somme des nombres finis', () => {
    expect(aggregateValues([10, 20.5, 3], 'sum')).toEqual({
      value: 33.5,
      count: 3,
    });
  });

  it('moyenne des nombres finis', () => {
    expect(aggregateValues([10, 20], 'avg')).toEqual({ value: 15, count: 2 });
  });

  it('ignore null, undefined, NaN, Infinity et chaines', () => {
    expect(
      aggregateValues([10, null, undefined, NaN, Infinity, '5', 20], 'sum'),
    ).toEqual({ value: 30, count: 2 });
  });

  it('retourne null quand aucune valeur numerique (pas de 0 trompeur)', () => {
    expect(aggregateValues([], 'sum')).toBeNull();
    expect(aggregateValues([null, 'abc'], 'avg')).toBeNull();
  });

  it('conserve les montants negatifs (avoirs)', () => {
    expect(aggregateValues([100, -40], 'sum')).toEqual({
      value: 60,
      count: 2,
    });
  });
});

describe('formatAggregate', () => {
  it('formate en nombre francais avec 2 decimales max', () => {
    // Intl fr-FR utilise l'espace inseparable etroite comme separateur.
    expect(formatAggregate(1234.567).replace(/\s/g, ' ')).toBe('1 234,57');
    expect(formatAggregate(15)).toBe('15');
  });
});
