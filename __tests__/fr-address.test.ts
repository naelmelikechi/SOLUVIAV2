import { describe, it, expect } from 'vitest';
import {
  parseFrAddress,
  formatClientAddressLines,
} from '@/lib/utils/fr-address';

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

describe('formatClientAddressLines', () => {
  it('adresse complete + localisation region : ignore la region', () => {
    // Cas FORMA QHRC : la ville reelle (Saint-Priest) est dans `adresse`,
    // `localisation` "Lyon" est un libelle interne qui ne doit pas s'afficher.
    expect(
      formatClientAddressLines('1 IMPASSE DU BACO, 69800 SAINT-PRIEST', 'Lyon'),
    ).toEqual(['1 IMPASSE DU BACO', '69800 SAINT-PRIEST']);
  });

  it('region differente de la ville de facturation : ignore la region', () => {
    // Cas ICADEMIE : facture a Toulon (83000), region interne "Aix en
    // Provence" -> ne jamais afficher les deux villes.
    expect(
      formatClientAddressLines('3 RUE RACINE, 83000 TOULON', 'Aix en Provence'),
    ).toEqual(['3 RUE RACINE', '83000 TOULON']);
  });

  it('rue seule + CP ville dans localisation : compose les deux lignes', () => {
    // Cas MONKY HOLDING : `adresse` = rue, `localisation` porte le CP+ville.
    expect(
      formatClientAddressLines('54 Chemin des Vignes', '47310 Estillac'),
    ).toEqual(['54 Chemin des Vignes', '47310 Estillac']);
  });

  it('adresse vide + CP ville dans localisation', () => {
    expect(formatClientAddressLines(null, '75008 Paris')).toEqual([
      '75008 Paris',
    ]);
  });

  it('aucun code postal : conserve la localisation libre (ville sans CP)', () => {
    expect(formatClientAddressLines('12 avenue des Champs', 'Paris')).toEqual([
      '12 avenue des Champs',
      'Paris',
    ]);
  });

  it('aucun code postal et localisation = rue : pas de doublon', () => {
    expect(
      formatClientAddressLines('12 avenue des Champs', '12 avenue des Champs'),
    ).toEqual(['12 avenue des Champs']);
  });

  it('tout vide -> aucune ligne', () => {
    expect(formatClientAddressLines(null, null)).toEqual([]);
  });
});
