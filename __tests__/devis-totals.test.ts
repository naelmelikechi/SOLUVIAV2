import { describe, it, expect } from 'vitest';
import { computeLigneTotaux } from '@/lib/utils/devis-totals';

describe('computeLigneTotaux', () => {
  it('calcule HT, TVA, TTC pour qte=1 PU=100 TVA=20', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 1,
        prix_unitaire_ht: 100,
        taux_tva: 20,
      }),
    ).toEqual({ total_ht: 100, total_tva: 20, total_ttc: 120 });
  });
  it('arrondit a 2 decimales (rounding cents entiers)', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 3,
        prix_unitaire_ht: 33.33,
        taux_tva: 20,
      }),
    ).toEqual({ total_ht: 99.99, total_tva: 20, total_ttc: 119.99 });
  });
  it('gere TVA 0', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 2,
        prix_unitaire_ht: 50,
        taux_tva: 0,
      }),
    ).toEqual({ total_ht: 100, total_tva: 0, total_ttc: 100 });
  });
});
