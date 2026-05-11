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
  // Generation d un SIRET valide pour les tests : on calcule a partir de
  // l implementation pour avoir un fixed-point garanti coherent avec le code.
  // Le but est de couvrir le happy path + le rejet checksum, pas de tester
  // contre des SIRET reels (necessiterait acces base INSEE).
  it('valide pour un SIRET dont les chiffres somment a 0 mod 10', () => {
    // 00000000000000 : sum = 0 -> mod 10 = 0 -> valide
    expect(isValidSiretLuhn('00000000000000')).toBe(true);
  });

  it('rejette si checksum Luhn invalide', () => {
    // 00000000000001 : sum = 2 (le 1 en position 13 odd -> double = 2)
    // mod 10 = 2 != 0
    expect(isValidSiretLuhn('00000000000001')).toBe(false);
    // 11111111111111 : alterne 1 et 2 -> 7*1 + 7*2 = 21 mod 10 = 1
    expect(isValidSiretLuhn('11111111111111')).toBe(false);
  });

  it('rejette si format invalide (court-circuite avant Luhn)', () => {
    expect(isValidSiretLuhn('1234')).toBe(false);
    expect(isValidSiretLuhn('1234567891234A')).toBe(false);
  });
});
