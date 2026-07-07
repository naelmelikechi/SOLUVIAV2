import { describe, it, expect } from 'vitest';
import {
  apprentisEnPipeline,
  conversionRate,
  computeFunnel,
  type OppLite,
  type EtapeLite,
} from './pipeline';

const etapes: EtapeLite[] = [
  { id: 'a', libelle: 'À contacter', ordre: 1 },
  { id: 'b', libelle: 'Proposition', ordre: 2 },
];
const opps: OppLite[] = [
  { statut: 'ouverte', etape_id: 'a' },
  { statut: 'ouverte', etape_id: 'b' },
  { statut: 'gagnee', etape_id: 'b' },
  { statut: 'perdue', etape_id: 'a' },
];

describe('agrégations pipeline', () => {
  it('conversionRate = gagnées / (gagnées + perdues) en %', () => {
    expect(conversionRate(opps)).toBe(50);
    expect(conversionRate([])).toBe(0);
  });
  it('computeFunnel groupe par étape, ordonné', () => {
    const f = computeFunnel(opps, etapes);
    expect(f.map((x) => x.etape.id)).toEqual(['a', 'b']);
    expect(f[0]!.count).toBe(2);
    expect(f[1]!.count).toBe(2);
  });
  it('apprentisEnPipeline somme nb_alternants des ouvertes uniquement', () => {
    const w: OppLite[] = [
      { statut: 'ouverte', etape_id: 'a', nb_alternants: 3 },
      { statut: 'ouverte', etape_id: 'b', nb_alternants: null },
      { statut: 'gagnee', etape_id: 'b', nb_alternants: 5 },
    ];
    expect(apprentisEnPipeline(w)).toBe(3);
  });
  it('conversionRate = 100 si tout est gagné, 0 si tout est perdu', () => {
    expect(conversionRate([{ statut: 'gagnee', etape_id: 'a' }])).toBe(100);
    expect(conversionRate([{ statut: 'perdue', etape_id: 'a' }])).toBe(0);
  });
  it('computeFunnel réordonne des étapes données dans le désordre', () => {
    const desordre: EtapeLite[] = [
      { id: 'b', libelle: 'Proposition', ordre: 2 },
      { id: 'a', libelle: 'À contacter', ordre: 1 },
    ];
    expect(computeFunnel(opps, desordre).map((x) => x.etape.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
