import { describe, it, expect } from 'vitest';
import {
  extractDecaPrefix,
  resolveOpcoFromDeca,
  type OpcoMapping,
} from '@/lib/opco/resolve';

const mapping: OpcoMapping = new Map([
  ['017', { code: 'AKTO', nom: 'AKTO - Commerce' }],
  ['030', { code: 'AKTO', nom: 'AKTO - Commerce' }],
  ['006', { code: 'OPCO_MOBILITES', nom: 'OPCO Mobilites' }],
]);

describe('extractDecaPrefix', () => {
  it('renvoie les 3 premiers chars d un DECA valide', () => {
    expect(extractDecaPrefix('017202605001222')).toBe('017');
  });
  it('renvoie null si DECA est null', () => {
    expect(extractDecaPrefix(null)).toBe(null);
  });
  it('renvoie null si DECA est vide', () => {
    expect(extractDecaPrefix('')).toBe(null);
  });
  it('renvoie null si DECA fait moins de 3 chars', () => {
    expect(extractDecaPrefix('01')).toBe(null);
  });
  it('renvoie null si DECA contient des non-chiffres dans le prefixe', () => {
    expect(extractDecaPrefix('AB1202605001222')).toBe(null);
  });
  it('trim avant extraction', () => {
    expect(extractDecaPrefix('  017202605001222  ')).toBe('017');
  });
});

describe('resolveOpcoFromDeca', () => {
  it('renvoie l OPCO correspondant au prefixe', () => {
    expect(resolveOpcoFromDeca('017202605001222', mapping)).toEqual({
      code: 'AKTO',
      nom: 'AKTO - Commerce',
    });
  });
  it('renvoie null si prefixe inconnu', () => {
    expect(resolveOpcoFromDeca('999202605001222', mapping)).toBe(null);
  });
  it('renvoie null si DECA invalide', () => {
    expect(resolveOpcoFromDeca(null, mapping)).toBe(null);
    expect(resolveOpcoFromDeca('', mapping)).toBe(null);
  });
  it('mapping vide renvoie toujours null', () => {
    expect(resolveOpcoFromDeca('017202605001222', new Map())).toBe(null);
  });
});
