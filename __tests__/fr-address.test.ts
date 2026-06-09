import { describe, it, expect } from 'vitest';
import { parseFrAddress } from '@/lib/utils/fr-address';

describe('parseFrAddress', () => {
  it('rue seule + "CP ville" dans localisation', () => {
    expect(
      parseFrAddress('47 rue de la Constitution', '50300 Avranches'),
    ).toEqual({
      street: '47 rue de la Constitution',
      zip: '50300',
      city: 'Avranches',
    });
  });

  it('"rue, CP VILLE" dans adresse (localisation sans CP)', () => {
    expect(
      parseFrAddress(
        "5 COUR DU BANC D'ARGUIN, 77176 SAVIGNY-LE-TEMPLE",
        'Savigny-le-Temple (77)',
      ),
    ).toEqual({
      street: "5 COUR DU BANC D'ARGUIN",
      zip: '77176',
      city: 'SAVIGNY-LE-TEMPLE',
    });
  });

  it('CP+ville uniquement dans localisation, adresse vide', () => {
    expect(parseFrAddress(null, '75008 Paris')).toEqual({
      street: null,
      zip: '75008',
      city: 'Paris',
    });
  });

  it('rue sans code postal reperable -> rue seule', () => {
    expect(parseFrAddress('12 avenue des Champs', null)).toEqual({
      street: '12 avenue des Champs',
      zip: null,
      city: null,
    });
  });

  it('tout vide -> tout null', () => {
    expect(parseFrAddress(null, null)).toEqual({
      street: null,
      zip: null,
      city: null,
    });
  });

  it('priorise adresse complete sur localisation', () => {
    // Si adresse contient deja "CP VILLE", on l'utilise (cas 1) sans aller
    // chercher la localisation.
    expect(
      parseFrAddress('10 rue de Paris, 69001 LYON', '69001 Lyon 1er'),
    ).toEqual({ street: '10 rue de Paris', zip: '69001', city: 'LYON' });
  });
});
