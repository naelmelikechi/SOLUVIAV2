import { describe, it, expect } from 'vitest';
import { negociationSchema } from './negociation';

describe('negociationSchema', () => {
  it('accepte vide (tout optionnel)', () => {
    const r = negociationSchema.parse({});
    expect(r.taux_npec).toBeNull();
    expect(r.formations_rncp).toEqual([]);
    expect(r.leviers).toEqual([]);
    expect(r.type_formation).toBeNull();
    expect(r.canal_origine).toBeNull();
  });

  it('coerce nombres, vide -> null', () => {
    const r = negociationSchema.parse({
      taux_npec: '8000',
      volume_an1: '',
      mois_demarrage: '9',
      duree_contrat_ans: '1.5',
    });
    expect(r.taux_npec).toBe(8000);
    expect(r.volume_an1).toBeNull();
    expect(r.mois_demarrage).toBe(9);
    expect(r.duree_contrat_ans).toBe(1.5);
  });

  it('rejette mois_demarrage hors 1-12', () => {
    expect(() => negociationSchema.parse({ mois_demarrage: '13' })).toThrow();
    expect(() => negociationSchema.parse({ mois_demarrage: '0' })).toThrow();
  });

  it('rejette type_formation invalide mais accepte vide -> null', () => {
    expect(() => negociationSchema.parse({ type_formation: 'x' })).toThrow();
    expect(
      negociationSchema.parse({ type_formation: '' }).type_formation,
    ).toBeNull();
  });

  it('accepte les enums valides', () => {
    const r = negociationSchema.parse({
      type_formation: 'hybride',
      canal_origine: 'apporteur',
      initiateur: 'soluvia',
      type_prospect: 'cfa',
    });
    expect(r.type_formation).toBe('hybride');
    expect(r.canal_origine).toBe('apporteur');
    expect(r.initiateur).toBe('soluvia');
    expect(r.type_prospect).toBe('cfa');
  });

  it('rejette un volume négatif', () => {
    expect(() => negociationSchema.parse({ volume_an1: '-3' })).toThrow();
  });

  it('conserve les tableaux fournis', () => {
    const r = negociationSchema.parse({
      formations_rncp: ['RNCP34826'],
      leviers: ['OPCO', 'FNE'],
    });
    expect(r.formations_rncp).toEqual(['RNCP34826']);
    expect(r.leviers).toEqual(['OPCO', 'FNE']);
  });
});
