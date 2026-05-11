import { describe, it, expect } from 'vitest';
import { normalizeForSearch, matchesSearch } from '@/lib/utils/search';

describe('normalizeForSearch', () => {
  it('lowercase + strip accents', () => {
    expect(normalizeForSearch('Élève à Côté')).toBe('eleve a cote');
  });

  it('collapse whitespace + trim', () => {
    expect(normalizeForSearch('  hello   world  ')).toBe('hello world');
  });

  it('null/undefined -> chaine vide', () => {
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
  });

  it('coerce non-string', () => {
    expect(normalizeForSearch(42)).toBe('42');
  });
});

describe('matchesSearch', () => {
  it('returns true si tous les tokens sont presents', () => {
    expect(matchesSearch('Jean Dupont', 'jean dupont')).toBe(true);
    expect(matchesSearch('Jean Dupont', 'dupont jean')).toBe(true); // ordre indifferent
  });

  it('insensible a la casse', () => {
    expect(matchesSearch('Jean DUPONT', 'jean')).toBe(true);
  });

  it('insensible aux accents', () => {
    expect(matchesSearch('Élève', 'eleve')).toBe(true);
    expect(matchesSearch('eleve', 'élève')).toBe(true);
  });

  it('returns false si un token manque', () => {
    expect(matchesSearch('Jean Dupont', 'jean martin')).toBe(false);
  });

  it('needle vide -> match toujours (pas de filtre)', () => {
    expect(matchesSearch('whatever', '')).toBe(true);
    expect(matchesSearch('whatever', '   ')).toBe(true);
  });
});
