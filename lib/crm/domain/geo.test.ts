import { describe, it, expect } from 'vitest';
import {
  DEPARTEMENTS,
  REGIONS,
  regionForDepartement,
  departementsForRegion,
  departementLabel,
  normalizeDepartement,
  isKnownDepartement,
  isKnownRegion,
  searchLocalZones,
} from './geo';

describe('référentiel géo', () => {
  it('contient 101 départements et 18 régions (13 métropole + 5 DOM)', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(REGIONS).toHaveLength(18);
  });

  it('a des codes département uniques', () => {
    const codes = DEPARTEMENTS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('inclut la Corse (2A/2B) et les DOM', () => {
    expect(isKnownDepartement('2A')).toBe(true);
    expect(isKnownDepartement('2B')).toBe(true);
    expect(isKnownDepartement('971')).toBe(true); // Guadeloupe
    expect(isKnownDepartement('976')).toBe(true); // Mayotte
  });
});

describe('regionForDepartement', () => {
  it('déduit la région du département', () => {
    expect(regionForDepartement('69')).toBe('Auvergne-Rhône-Alpes');
    expect(regionForDepartement('75')).toBe('Île-de-France');
    expect(regionForDepartement('2A')).toBe('Corse');
    expect(regionForDepartement('974')).toBe('La Réunion');
  });
  it('normalise les saisies (1 → 01, 2a → 2A)', () => {
    expect(regionForDepartement('1')).toBe('Auvergne-Rhône-Alpes');
    expect(regionForDepartement('2a')).toBe('Corse');
  });
  it('retourne null pour un code inconnu ou vide', () => {
    expect(regionForDepartement('99')).toBeNull();
    expect(regionForDepartement('')).toBeNull();
    expect(regionForDepartement(null)).toBeNull();
  });
});

describe('departementsForRegion', () => {
  it("liste les départements d'une région", () => {
    expect(departementsForRegion('Bretagne').sort()).toEqual([
      '22',
      '29',
      '35',
      '56',
    ]);
    expect(departementsForRegion('Corse').sort()).toEqual(['2A', '2B']);
  });
  it('retourne [] pour une région inconnue', () => {
    expect(departementsForRegion('Atlantide')).toEqual([]);
    expect(departementsForRegion(null)).toEqual([]);
  });
});

describe('departementLabel', () => {
  it('formate code - nom', () => {
    expect(departementLabel('69')).toBe('69 - Rhône');
    expect(departementLabel('2B')).toBe('2B - Haute-Corse');
  });
  it('retourne null si vide', () => {
    expect(departementLabel(null)).toBeNull();
  });
});

describe('normalizeDepartement', () => {
  it('pad les codes à un chiffre', () => {
    expect(normalizeDepartement('1')).toBe('01');
    expect(normalizeDepartement('9')).toBe('09');
  });
  it('préserve la Corse et les DOM', () => {
    expect(normalizeDepartement('2a')).toBe('2A');
    expect(normalizeDepartement('971')).toBe('971');
  });
});

describe('isKnownRegion', () => {
  it('reconnaît les régions du référentiel', () => {
    expect(isKnownRegion('Occitanie')).toBe(true);
    expect(isKnownRegion('Nulle part')).toBe(false);
    expect(isKnownRegion(null)).toBe(false);
  });
});

describe('searchLocalZones', () => {
  it('trouve un département par nom (insensible aux accents)', () => {
    const res = searchLocalZones('rhone');
    expect(
      res.some((z) => z.type === 'departement' && z.label.includes('Rhône')),
    ).toBe(true);
  });
  it('trouve un département par code', () => {
    const res = searchLocalZones('75');
    expect(
      res.some((z) => z.type === 'departement' && z.label.startsWith('75')),
    ).toBe(true);
  });
  it('trouve une région', () => {
    const res = searchLocalZones('auvergne');
    expect(
      res.some(
        (z) => z.type === 'region' && z.region === 'Auvergne-Rhône-Alpes',
      ),
    ).toBe(true);
  });
  it('retourne [] pour une requête vide', () => {
    expect(searchLocalZones('')).toEqual([]);
  });
});
