import { describe, it, expect } from 'vitest';
import { computeDureeMois } from '@/lib/utils/duree-contrat';

describe('computeDureeMois', () => {
  it('rend 12 pour un contrat de 12 mois a date_fin incluse (J -> J-1)', () => {
    // Cas reel FORMA QHRC : tombait a 11 avec la troncature, ce qui supprimait
    // le jalon M+12 de l'echeancier.
    expect(computeDureeMois('2026-05-26', '2027-05-25')).toBe(12);
    expect(computeDureeMois('2026-07-08', '2027-07-07')).toBe(12);
    expect(computeDureeMois('2026-08-01', '2027-07-31')).toBe(12);
  });

  it('rend 12 quand la fin tombe le dernier jour du mois precedent', () => {
    expect(computeDureeMois('2026-05-01', '2027-04-30')).toBe(12);
    expect(computeDureeMois('2026-06-02', '2027-06-01')).toBe(12);
  });

  it('rend 12 pour un anniversaire exact (deja correct avant le fix)', () => {
    expect(computeDureeMois('2026-06-01', '2027-06-01')).toBe(12);
  });

  it('ne gonfle pas un contrat reellement plus court', () => {
    expect(computeDureeMois('2026-05-01', '2027-04-01')).toBe(11);
    expect(computeDureeMois('2026-01-01', '2026-07-01')).toBe(6);
    expect(computeDureeMois('2026-01-01', '2026-03-10')).toBe(2);
  });

  it('bascule au mois superieur a partir de 15 jours de reliquat', () => {
    expect(computeDureeMois('2026-01-01', '2026-06-14')).toBe(5);
    expect(computeDureeMois('2026-01-01', '2026-06-16')).toBe(6);
  });

  it('rend 0 pour un contrat de quelques jours', () => {
    expect(computeDureeMois('2026-01-01', '2026-01-05')).toBe(0);
  });

  it('rend null si une date manque ou est invalide', () => {
    expect(computeDureeMois(null, '2027-05-25')).toBeNull();
    expect(computeDureeMois('2026-05-26', null)).toBeNull();
    expect(computeDureeMois(undefined, undefined)).toBeNull();
    expect(computeDureeMois('pas-une-date', '2027-05-25')).toBeNull();
    expect(computeDureeMois('2026-05-26', '')).toBeNull();
  });
});
