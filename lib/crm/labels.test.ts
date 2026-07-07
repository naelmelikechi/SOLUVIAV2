import { describe, it, expect } from 'vitest';
import { label, statutOppLabel, prioriteLabel } from './labels';

describe('label()', () => {
  it('traduit une valeur connue', () => {
    expect(label(statutOppLabel, 'gagnee')).toBe('Gagnée');
    expect(label(prioriteLabel, 'haute')).toBe('Haute');
  });
  it('retombe sur la valeur brute si inconnue', () => {
    expect(label(statutOppLabel, 'zzz')).toBe('zzz');
  });
  it('rend un tiret pour null/undefined/vide', () => {
    expect(label(statutOppLabel, null)).toBe('-');
    expect(label(statutOppLabel, undefined)).toBe('-');
    expect(label(statutOppLabel, '')).toBe('-');
  });
});
