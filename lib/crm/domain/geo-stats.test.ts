import { describe, it, expect } from 'vitest';
import {
  countParRegion,
  aggregateParRegion,
  countNonGeolocalisees,
  tauxGeolocalisation,
  fenetreRentree,
  filtreRentree,
  type OppRegions,
} from './geo-stats';

const opp = (statut: string, regions: (string | null)[]): OppRegions => ({
  statut,
  compte: { adresses: regions.map((region) => ({ region })) },
});

const oppN = (
  statut: string,
  regions: (string | null)[],
  nb: number | null,
): OppRegions => ({
  statut,
  nb_alternants: nb,
  compte: { adresses: regions.map((region) => ({ region })) },
});

const oppD = (
  statut: string,
  regions: (string | null)[],
  date: string | null,
): OppRegions => ({
  statut,
  date_demarrage_souhaitee: date,
  compte: { adresses: regions.map((region) => ({ region })) },
});

describe('countParRegion', () => {
  it('compte une opp ouverte par région', () => {
    expect(countParRegion([opp('ouverte', ['Bretagne'])])).toEqual({
      Bretagne: 1,
    });
  });

  it('compte une opp dans chaque région distincte', () => {
    expect(countParRegion([opp('ouverte', ['Bretagne', 'Normandie'])])).toEqual(
      {
        Bretagne: 1,
        Normandie: 1,
      },
    );
  });

  it('ne compte pas deux fois une même région pour une opp', () => {
    expect(countParRegion([opp('ouverte', ['Bretagne', 'Bretagne'])])).toEqual({
      Bretagne: 1,
    });
  });

  it('ignore les opps non ouvertes', () => {
    expect(
      countParRegion([
        opp('gagnee', ['Bretagne']),
        opp('perdue', ['Bretagne']),
      ]),
    ).toEqual({});
  });

  it('ignore les régions nulles et les opps sans adresse', () => {
    expect(
      countParRegion([
        opp('ouverte', [null]),
        { statut: 'ouverte', compte: null },
      ]),
    ).toEqual({});
  });

  it('liste vide → objet vide', () => {
    expect(countParRegion([])).toEqual({});
  });

  it('agrège plusieurs opps sur une même région', () => {
    expect(
      countParRegion([
        opp('ouverte', ['Bretagne']),
        opp('ouverte', ['Bretagne']),
      ]),
    ).toEqual({
      Bretagne: 2,
    });
  });
});

describe('aggregateParRegion', () => {
  it('extracteur constant (=1) reproduit countParRegion', () => {
    expect(
      aggregateParRegion([oppN('ouverte', ['Bretagne'], 5)], () => 1),
    ).toEqual({ Bretagne: 1 });
  });

  it('extracteur nb_alternants somme les valeurs par région', () => {
    expect(
      aggregateParRegion(
        [oppN('ouverte', ['Bretagne'], 5), oppN('ouverte', ['Bretagne'], 3)],
        (o) => o.nb_alternants ?? 0,
      ),
    ).toEqual({ Bretagne: 8 });
  });

  it('valeur comptée une fois par région distincte (opp multi-sites même région)', () => {
    expect(
      aggregateParRegion(
        [oppN('ouverte', ['Bretagne', 'Bretagne'], 4)],
        (o) => o.nb_alternants ?? 0,
      ),
    ).toEqual({ Bretagne: 4 });
  });

  it('opp sur deux régions : valeur ajoutée dans chacune', () => {
    expect(
      aggregateParRegion(
        [oppN('ouverte', ['Bretagne', 'Normandie'], 4)],
        (o) => o.nb_alternants ?? 0,
      ),
    ).toEqual({ Bretagne: 4, Normandie: 4 });
  });

  it('nb_alternants nul → région présente à 0', () => {
    expect(
      aggregateParRegion(
        [oppN('ouverte', ['Bretagne'], null)],
        (o) => o.nb_alternants ?? 0,
      ),
    ).toEqual({ Bretagne: 0 });
  });

  it('ignore les non-ouvertes', () => {
    expect(
      aggregateParRegion(
        [oppN('gagnee', ['Bretagne'], 5)],
        (o) => o.nb_alternants ?? 0,
      ),
    ).toEqual({});
  });
});

describe('countNonGeolocalisees', () => {
  it('compte les opps ouvertes sans aucune région', () => {
    expect(
      countNonGeolocalisees([
        oppD('ouverte', [null], null),
        oppD('ouverte', ['Bretagne'], null),
      ]),
    ).toBe(1);
  });

  it('opp sans compte ou sans adresse = non géolocalisée', () => {
    expect(countNonGeolocalisees([{ statut: 'ouverte', compte: null }])).toBe(
      1,
    );
  });

  it('ignore les non-ouvertes', () => {
    expect(countNonGeolocalisees([oppD('gagnee', [null], null)])).toBe(0);
  });
});

describe('tauxGeolocalisation', () => {
  it('ratio géolocalisées / total ouvertes en %', () => {
    expect(
      tauxGeolocalisation([
        oppD('ouverte', ['Bretagne'], null),
        oppD('ouverte', [null], null),
      ]),
    ).toBe(50);
  });

  it('0 opp ouverte → 0 (pas de division par zéro)', () => {
    expect(tauxGeolocalisation([])).toBe(0);
  });

  it('ignore les non-ouvertes dans le dénominateur', () => {
    expect(
      tauxGeolocalisation([
        oppD('ouverte', ['Bretagne'], null),
        oppD('gagnee', [null], null),
      ]),
    ).toBe(100);
  });
});

describe('fenetreRentree', () => {
  it("avant novembre → rentrée de l'année courante (août-oct)", () => {
    expect(fenetreRentree(new Date('2026-06-15'))).toEqual({
      debut: '2026-08-01',
      fin: '2026-10-31',
    });
  });

  it("après octobre → rentrée de l'année suivante", () => {
    expect(fenetreRentree(new Date('2026-11-15'))).toEqual({
      debut: '2027-08-01',
      fin: '2027-10-31',
    });
  });
});

describe('filtreRentree', () => {
  const f = { debut: '2026-08-01', fin: '2026-10-31' };

  it('garde les opps dont la date de démarrage est dans la fenêtre (bornes incluses)', () => {
    expect(
      filtreRentree(
        [
          oppD('ouverte', ['Bretagne'], '2026-08-01'),
          oppD('ouverte', ['Bretagne'], '2026-10-31'),
        ],
        f,
      ).length,
    ).toBe(2);
  });

  it('exclut hors fenêtre et date nulle', () => {
    expect(
      filtreRentree(
        [
          oppD('ouverte', ['Bretagne'], '2026-07-31'),
          oppD('ouverte', ['Bretagne'], null),
        ],
        f,
      ).length,
    ).toBe(0);
  });
});
