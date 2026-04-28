import { describe, it, expect } from 'vitest';
import {
  ACTIVE_CONTRACT_STATES,
  isContratActif,
} from '@/lib/utils/contrat-states';

describe('isContratActif', () => {
  it('returns true for the internal "actif" state', () => {
    expect(isContratActif('actif')).toBe(true);
  });

  it('returns true for raw Eduvia "in flight" states', () => {
    for (const s of ['ENGAGE', 'EN_COURS_INSTRUCTION', 'TRANSMIS', 'NOTSENT']) {
      expect(isContratActif(s)).toBe(true);
    }
  });

  it('returns false for terminal/cancelled states', () => {
    for (const s of ['suspendu', 'resilie', 'termine', 'ANNULE']) {
      expect(isContratActif(s)).toBe(false);
    }
  });

  it('returns false for null/undefined/empty', () => {
    expect(isContratActif(null)).toBe(false);
    expect(isContratActif(undefined)).toBe(false);
    expect(isContratActif('')).toBe(false);
  });

  it('case-sensitive: "actif" matches but "ACTIF" does not', () => {
    expect(isContratActif('actif')).toBe(true);
    expect(isContratActif('ACTIF')).toBe(false);
    expect(isContratActif('engage')).toBe(false);
  });

  it('exposes the canonical Set for non-helper consumers', () => {
    expect(ACTIVE_CONTRACT_STATES.has('actif')).toBe(true);
    expect(ACTIVE_CONTRACT_STATES.size).toBe(5);
  });
});
