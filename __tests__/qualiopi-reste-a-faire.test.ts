import { describe, it, expect } from 'vitest';
import {
  resteAFaireQualiopi,
  PLAFOND_GROUPES,
  type ReferentielDeliverable,
} from '@/lib/qualiopi/reste-a-faire';

function deliverable(
  overrides: Partial<ReferentielDeliverable> & {
    deliverableId: number;
  },
): ReferentielDeliverable {
  return {
    criterionId: 1,
    criterionPrefix: 'C1',
    indicatorId: 1,
    indicatorCode: 'IND-01',
    indicatorTitle: 'Indicateur 1',
    ...overrides,
  };
}

describe('resteAFaireQualiopi', () => {
  it('un livrable conforme ne figure pas dans le reste a faire', () => {
    const referentiel = [deliverable({ deliverableId: 1 })];
    const statuses = [{ deliverable_id: 1, status: 'conform' as const }];

    const result = resteAFaireQualiopi(referentiel, statuses, 1);

    expect(result.groups).toEqual([]);
    expect(result.totalGroupes).toBe(0);
  });

  it('un livrable sans statut compte comme manquant', () => {
    const referentiel = [deliverable({ deliverableId: 1 })];

    const result = resteAFaireQualiopi(referentiel, [], 1);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.manquants).toBe(1);
  });

  it('le gain d un groupe est nb manquants / denominateur x 100, et le tri est par gain decroissant', () => {
    // 2 indicateurs, 2 livrables chacun, 2 campus : denominateur = 4 * 2 = 8.
    const referentiel = [
      deliverable({
        deliverableId: 1,
        indicatorId: 1,
        indicatorCode: 'IND-01',
      }),
      deliverable({
        deliverableId: 2,
        indicatorId: 1,
        indicatorCode: 'IND-01',
      }),
      deliverable({
        deliverableId: 3,
        indicatorId: 2,
        indicatorCode: 'IND-02',
        indicatorTitle: 'Indicateur 2',
      }),
      deliverable({
        deliverableId: 4,
        indicatorId: 2,
        indicatorCode: 'IND-02',
        indicatorTitle: 'Indicateur 2',
      }),
    ];
    // d1 : conforme sur les 2 campus -> 0 manquant.
    // d2 : conforme sur 1 seul campus -> 1 manquant. IND-01 total = 1.
    // d3, d4 : aucun statut -> 2 manquants chacun. IND-02 total = 4.
    const statuses = [
      { deliverable_id: 1, status: 'conform' as const },
      { deliverable_id: 1, status: 'conform' as const },
      { deliverable_id: 2, status: 'conform' as const },
    ];

    const result = resteAFaireQualiopi(referentiel, statuses, 2);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({
      indicatorId: 2,
      manquants: 4,
      gain: 50,
    });
    expect(result.groups[1]).toMatchObject({
      indicatorId: 1,
      manquants: 1,
      gain: 12.5,
    });
  });

  it('a gain egal, le tri retombe sur le code indicateur croissant, de facon stable', () => {
    const referentiel = [
      deliverable({
        deliverableId: 1,
        indicatorId: 2,
        indicatorCode: 'IND-02',
      }),
      deliverable({
        deliverableId: 2,
        indicatorId: 1,
        indicatorCode: 'IND-01',
      }),
    ];

    const result = resteAFaireQualiopi(referentiel, [], 1);

    expect(result.groups.map((g) => g.indicatorCode)).toEqual([
      'IND-01',
      'IND-02',
    ]);

    // Rejoue plusieurs fois : l'ordre ne doit jamais danser.
    const secondRun = resteAFaireQualiopi(referentiel, [], 1);
    expect(secondRun.groups.map((g) => g.indicatorCode)).toEqual(
      result.groups.map((g) => g.indicatorCode),
    );
  });

  it('un referentiel vide retourne une liste vide sans planter', () => {
    const result = resteAFaireQualiopi([], [], 3);
    expect(result.groups).toEqual([]);
    expect(result.totalGroupes).toBe(0);
  });

  it('zero campus retourne une liste vide (denominateur nul, pas de division par zero)', () => {
    const referentiel = [deliverable({ deliverableId: 1 })];
    const result = resteAFaireQualiopi(referentiel, [], 0);
    expect(result.groups).toEqual([]);
    expect(result.totalGroupes).toBe(0);
  });

  it('la liste est plafonnee a 10 groupes, avec le total expose', () => {
    const referentiel = Array.from({ length: 15 }, (_, i) => {
      const n = i + 1;
      const code = `IND-${String(n).padStart(2, '0')}`;
      return deliverable({
        deliverableId: n,
        indicatorId: n,
        indicatorCode: code,
        indicatorTitle: `Indicateur ${n}`,
      });
    });

    const result = resteAFaireQualiopi(referentiel, [], 1);

    expect(result.groups).toHaveLength(PLAFOND_GROUPES);
    expect(result.totalGroupes).toBe(15);
    // Gains egaux partout -> tri par code croissant, donc les 10 premiers.
    expect(result.groups.map((g) => g.indicatorCode)).toEqual([
      'IND-01',
      'IND-02',
      'IND-03',
      'IND-04',
      'IND-05',
      'IND-06',
      'IND-07',
      'IND-08',
      'IND-09',
      'IND-10',
    ]);
  });
});
