import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { optionalUuid, optionalDate } from './helpers';

const uuid = '00000000-0000-0000-0000-000000000000';

describe('optionalUuid', () => {
  it("transforme la chaîne vide (combobox vidé) en null - évite l'erreur Postgres", () => {
    expect(optionalUuid.parse('')).toBeNull();
  });
  it('laisse passer null/undefined en null', () => {
    expect(optionalUuid.parse(null)).toBeNull();
    expect(optionalUuid.parse(undefined)).toBeNull();
  });
  it('conserve un UUID valide', () => {
    expect(optionalUuid.parse(uuid)).toBe(uuid);
  });
  it('rejette une chaîne non-UUID non vide', () => {
    expect(() => optionalUuid.parse('pas-un-uuid')).toThrow();
  });
});

describe('optionalDate', () => {
  it('transforme la chaîne vide (input date vidé) en null', () => {
    expect(optionalDate.parse('')).toBeNull();
  });
  it('conserve une date ISO', () => {
    expect(optionalDate.parse('2026-06-25')).toBe('2026-06-25');
  });
  it('null/undefined -> null', () => {
    expect(optionalDate.parse(null)).toBeNull();
    expect(z.object({ d: optionalDate }).parse({}).d).toBeNull();
  });
});
