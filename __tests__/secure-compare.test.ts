import { describe, it, expect } from 'vitest';
import { timingSafeStrEqual } from '@/lib/utils/secure-compare';

describe('timingSafeStrEqual', () => {
  it('renvoie true pour deux chaînes identiques', () => {
    expect(timingSafeStrEqual('Bearer s3cret', 'Bearer s3cret')).toBe(true);
  });

  it('renvoie false pour des chaînes de même longueur mais différentes', () => {
    expect(timingSafeStrEqual('abcdef', 'abcdeg')).toBe(false);
  });

  it('renvoie false pour des longueurs différentes (pas de throw)', () => {
    expect(timingSafeStrEqual('short', 'a-much-longer-secret')).toBe(false);
  });

  it('renvoie false pour null/undefined sans lever', () => {
    expect(timingSafeStrEqual(null, 'x')).toBe(false);
    expect(timingSafeStrEqual('x', undefined)).toBe(false);
    expect(timingSafeStrEqual(null, null)).toBe(false);
  });

  it('gère correctement les chaînes vides', () => {
    expect(timingSafeStrEqual('', '')).toBe(true);
    expect(timingSafeStrEqual('', 'x')).toBe(false);
  });

  it('compare octet par octet (unicode multi-byte)', () => {
    expect(timingSafeStrEqual('été', 'été')).toBe(true);
    expect(timingSafeStrEqual('été', 'ete')).toBe(false);
  });
});
