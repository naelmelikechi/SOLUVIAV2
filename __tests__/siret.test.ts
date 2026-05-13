import { describe, it, expect } from 'vitest';
import {
  normalizeSiret,
  isValidSiretFormat,
  isValidSiretLuhn,
} from '@/lib/utils/siret';

describe('normalizeSiret', () => {
  it('retire les espaces (formats type "123 456 789 12345")', () => {
    expect(normalizeSiret('123 456 789 12345')).toBe('12345678912345');
    expect(normalizeSiret('  123\t456\n789 12345  ')).toBe('12345678912345');
  });

  it('retourne chaine vide pour null/undefined', () => {
    expect(normalizeSiret(null)).toBe('');
    expect(normalizeSiret(undefined)).toBe('');
  });
});

describe('isValidSiretFormat', () => {
  it('valide pour 14 chiffres exacts', () => {
    expect(isValidSiretFormat('12345678912345')).toBe(true);
  });

  it('rejette si moins de 14 chiffres', () => {
    expect(isValidSiretFormat('1234567891234')).toBe(false);
  });

  it('rejette si plus de 14 chiffres', () => {
    expect(isValidSiretFormat('123456789123456')).toBe(false);
  });

  it('rejette si contient des caracteres non-chiffres', () => {
    expect(isValidSiretFormat('12345678912AB5')).toBe(false);
    expect(isValidSiretFormat('123 456 789 12345')).toBe(false);
  });
});

describe('isValidSiretLuhn', () => {
  it('valide pour des SIRET reels valides', () => {
    // Exemple Wikipedia (SIRET valide officiellement)
    expect(isValidSiretLuhn('73282932000074')).toBe(true);
    // HEOL ACADEMY (source : pappers.fr)
    expect(isValidSiretLuhn('92255939800032')).toBe(true);
  });

  it('valide pour 00000000000000 (cas limite, somme = 0)', () => {
    expect(isValidSiretLuhn('00000000000000')).toBe(true);
  });

  it('rejette si checksum Luhn invalide', () => {
    // 1 final transforme un SIRET zero en checksum invalide
    expect(isValidSiretLuhn('00000000000001')).toBe(false);
    // 11111111111111 : 7 chiffres doubles a 2 + 7 chiffres a 1 = 21
    expect(isValidSiretLuhn('11111111111111')).toBe(false);
    // SIRET reel altere
    expect(isValidSiretLuhn('92255939800033')).toBe(false);
  });

  it('rejette si format invalide (court-circuite avant Luhn)', () => {
    expect(isValidSiretLuhn('1234')).toBe(false);
    expect(isValidSiretLuhn('1234567891234A')).toBe(false);
  });
});
