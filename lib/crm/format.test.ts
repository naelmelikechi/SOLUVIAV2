import { describe, it, expect } from 'vitest';
import {
  formatEuros,
  formatDateTime,
  formatDate,
  todayInParis,
} from './format';

describe('todayInParis', () => {
  it('retourne exactement le format YYYY-MM-DD (contrat des requêtes badge/dashboard)', () => {
    expect(todayInParis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatEuros', () => {
  it('coerce les numeric Postgres renvoyés en string (équiv. au number)', () => {
    expect(formatEuros('1500')).toBe(formatEuros(1500));
  });
  it('rend 0 € pour null/undefined/non-fini', () => {
    expect(formatEuros(null)).toBe('0 €');
    expect(formatEuros(undefined)).toBe('0 €');
    expect(formatEuros('abc')).toBe('0 €');
  });
});

describe('formatDateTime', () => {
  it("affiche l'année quand elle diffère de l'année courante (B-L3)", () => {
    expect(formatDateTime('2099-01-15T10:00:00Z')).toContain('2099');
  });
  it('rend un tiret pour une valeur absente/invalide', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime('pas-une-date')).toBe('-');
  });
});

describe('formatDate', () => {
  it('rend un tiret pour null', () => {
    expect(formatDate(null)).toBe('-');
  });
});
