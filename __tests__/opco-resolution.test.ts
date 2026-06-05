import { describe, it, expect } from 'vitest';
import {
  normalizeIdcc,
  resolveOpcoFromIdcc,
  type OpcoMapping,
} from '@/lib/opco/resolve';

const mapping: OpcoMapping = new Map([
  ['1979', { code: 'AKTO', nom: 'AKTO' }],
  ['1501', { code: 'AKTO', nom: 'AKTO' }],
  ['3032', { code: 'OPCO_EP', nom: 'OPCO EP' }],
]);

describe('normalizeIdcc', () => {
  it('zéro-pad un IDCC court sur 4 chiffres', () => {
    expect(normalizeIdcc('16')).toBe('0016');
    expect(normalizeIdcc('86')).toBe('0086');
  });
  it('laisse intact un IDCC déjà sur 4 chiffres', () => {
    expect(normalizeIdcc('1979')).toBe('1979');
  });
  it('trim avant normalisation', () => {
    expect(normalizeIdcc('  3032  ')).toBe('3032');
  });
  it('renvoie null si absent', () => {
    expect(normalizeIdcc(null)).toBe(null);
    expect(normalizeIdcc(undefined)).toBe(null);
    expect(normalizeIdcc('')).toBe(null);
  });
  it('renvoie null si non numérique ou trop long', () => {
    expect(normalizeIdcc('AB12')).toBe(null);
    expect(normalizeIdcc('12345')).toBe(null);
  });
});

describe('resolveOpcoFromIdcc', () => {
  it('renvoie l OPCO correspondant à l IDCC', () => {
    expect(resolveOpcoFromIdcc('1979', mapping)).toEqual({
      code: 'AKTO',
      nom: 'AKTO',
    });
  });
  it('résout via la forme normalisée (zéro-pad)', () => {
    const m: OpcoMapping = new Map([
      ['0016', { code: 'OPCO_MOBILITES', nom: 'OPCO Mobilités' }],
    ]);
    expect(resolveOpcoFromIdcc('16', m)).toEqual({
      code: 'OPCO_MOBILITES',
      nom: 'OPCO Mobilités',
    });
  });
  it('renvoie null si IDCC inconnu', () => {
    expect(resolveOpcoFromIdcc('9999', mapping)).toBe(null);
  });
  it('renvoie null si IDCC invalide', () => {
    expect(resolveOpcoFromIdcc(null, mapping)).toBe(null);
    expect(resolveOpcoFromIdcc('', mapping)).toBe(null);
  });
  it('mapping vide renvoie toujours null', () => {
    expect(resolveOpcoFromIdcc('1979', new Map())).toBe(null);
  });
});
