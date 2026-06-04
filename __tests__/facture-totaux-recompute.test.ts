import { describe, it, expect } from 'vitest';
import { computeFactureTotaux } from '@/lib/utils/facture-totaux';

describe('computeFactureTotaux', () => {
  it('mono-taux : TVA = taux × HT', () => {
    const r = computeFactureTotaux(
      [{ montant_ht: 1000, taux_tva_ligne: 20 }],
      20,
    );
    expect(r).toEqual({
      totalHt: 1000,
      montantTva: 200,
      montantTtc: 1200,
      tauxTvaEffectif: 20,
    });
  });

  it('TAUX MIXTES : TVA calculée par ligne, pas au taux header à plat', () => {
    // 1000 à 20% (=200) + 500 exonéré (=0). Header 20% à plat donnerait 300 (FAUX).
    const r = computeFactureTotaux(
      [
        { montant_ht: 1000, taux_tva_ligne: 20 },
        { montant_ht: 500, taux_tva_ligne: 0 },
      ],
      20,
    );
    expect(r.totalHt).toBe(1500);
    expect(r.montantTva).toBe(200); // et NON 300
    expect(r.montantTtc).toBe(1700);
    expect(r.tauxTvaEffectif).toBe(13.33); // 200/1500*100
  });

  it('ligne sans taux propre → fallback sur le taux header', () => {
    const r = computeFactureTotaux(
      [{ montant_ht: 1000, taux_tva_ligne: null }],
      10,
    );
    expect(r.montantTva).toBe(100);
    expect(r.tauxTvaEffectif).toBe(10);
  });

  it('arrondi au centime par ligne', () => {
    const r = computeFactureTotaux(
      [{ montant_ht: 1234.56, taux_tva_ligne: 20 }],
      20,
    );
    // round(1234.56 * 20) / 100 = round(24691.2)/100 = 246.91
    expect(r.montantTva).toBe(246.91);
    expect(r.montantTtc).toBe(1481.47);
  });

  it('facture vide → totaux à 0, taux effectif = header', () => {
    const r = computeFactureTotaux([], 20);
    expect(r).toEqual({
      totalHt: 0,
      montantTva: 0,
      montantTtc: 0,
      tauxTvaEffectif: 20,
    });
  });

  it('avoir (montants négatifs) : TVA négative, taux effectif positif', () => {
    const r = computeFactureTotaux(
      [{ montant_ht: -1000, taux_tva_ligne: 20 }],
      20,
    );
    expect(r.totalHt).toBe(-1000);
    expect(r.montantTva).toBe(-200);
    expect(r.montantTtc).toBe(-1200);
    expect(r.tauxTvaEffectif).toBe(20);
  });

  it('multi-lignes même taux : somme cohérente', () => {
    const r = computeFactureTotaux(
      [
        { montant_ht: 333.33, taux_tva_ligne: 20 },
        { montant_ht: 333.33, taux_tva_ligne: 20 },
        { montant_ht: 333.34, taux_tva_ligne: 20 },
      ],
      20,
    );
    expect(r.totalHt).toBe(1000);
    // round(333.33*20)/100=66.67 ×2 + round(333.34*20)/100=66.67 => 200.01
    expect(r.montantTva).toBe(200.01);
    expect(r.montantTtc).toBe(1200.01);
  });
});
