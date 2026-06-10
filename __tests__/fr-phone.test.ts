import { describe, it, expect } from 'vitest';
import { normalizeFrPhone } from '@/lib/utils/fr-phone';

describe('normalizeFrPhone', () => {
  it('compact 10 chiffres -> espace', () => {
    expect(normalizeFrPhone('0612345678')).toBe('06 12 34 56 78');
  });

  it('deja espace -> inchange', () => {
    expect(normalizeFrPhone('06 12 34 56 78')).toBe('06 12 34 56 78');
  });

  it('idempotent sur sa propre sortie', () => {
    const once = normalizeFrPhone('0612345678');
    expect(normalizeFrPhone(once)).toBe(once);
  });

  it('separateurs points', () => {
    expect(normalizeFrPhone('06.12.34.56.78')).toBe('06 12 34 56 78');
  });

  it('separateurs tirets', () => {
    expect(normalizeFrPhone('06-12-34-56-78')).toBe('06 12 34 56 78');
  });

  it('espaces irreguliers + bords', () => {
    expect(normalizeFrPhone('  06   12 345  678 ')).toBe('06 12 34 56 78');
  });

  it('prefixe international +33', () => {
    expect(normalizeFrPhone('+33612345678')).toBe('06 12 34 56 78');
    expect(normalizeFrPhone('+33 6 12 34 56 78')).toBe('06 12 34 56 78');
  });

  it('prefixe 0033', () => {
    expect(normalizeFrPhone('0033612345678')).toBe('06 12 34 56 78');
  });

  it('+33 (0)6 ... (zero entre parentheses)', () => {
    expect(normalizeFrPhone('+33 (0)6 12 34 56 78')).toBe('06 12 34 56 78');
  });

  it('fixe parisien 01', () => {
    expect(normalizeFrPhone('0123456789')).toBe('01 23 45 67 89');
  });

  it('9 chiffres sans le 0 de tete -> ajoute le 0', () => {
    expect(normalizeFrPhone('612345678')).toBe('06 12 34 56 78');
  });

  it('vide / null / undefined / espaces -> null', () => {
    expect(normalizeFrPhone('')).toBeNull();
    expect(normalizeFrPhone('   ')).toBeNull();
    expect(normalizeFrPhone(null)).toBeNull();
    expect(normalizeFrPhone(undefined)).toBeNull();
  });

  it('numero etranger -> preserve tel quel (trimme)', () => {
    expect(normalizeFrPhone('+44 20 7946 0000')).toBe('+44 20 7946 0000');
  });

  it('extension / texte libre -> preserve', () => {
    expect(normalizeFrPhone('0612345678 poste 12')).toBe('0612345678 poste 12');
    expect(normalizeFrPhone('a demander')).toBe('a demander');
  });

  it('trop court -> preserve', () => {
    expect(normalizeFrPhone('12345')).toBe('12345');
  });
});
