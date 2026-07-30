import { describe, it, expect } from 'vitest';
import { getTacheState } from '@/lib/process/tache-state';

const base = {
  realise: false,
  valide_cdp: false,
  valide: false,
  echeance: null,
};
describe('getTacheState', () => {
  it('valide', () =>
    expect(getTacheState({ ...base, valide: true }, '2026-07-30')).toBe(
      'valide',
    ));
  it('valide_cdp', () =>
    expect(getTacheState({ ...base, valide_cdp: true }, '2026-07-30')).toBe(
      'valide_cdp',
    ));
  it('realise', () =>
    expect(getTacheState({ ...base, realise: true }, '2026-07-30')).toBe(
      'realise',
    ));
  it('en_retard', () =>
    expect(
      getTacheState({ ...base, echeance: '2026-07-01' }, '2026-07-30'),
    ).toBe('en_retard'));
  it('a_faire', () =>
    expect(
      getTacheState({ ...base, echeance: '2026-12-01' }, '2026-07-30'),
    ).toBe('a_faire'));
});
