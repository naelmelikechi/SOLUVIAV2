import { describe, it, expect } from 'vitest';
import { computeFactureTotauxTtcInclus } from '@/lib/utils/facture-totaux-ttc-inclus';

describe('computeFactureTotauxTtcInclus', () => {
  it('cas standard 20% : total_ttc=120 -> ht=100, tva=20', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 120 }],
      20,
    );
    expect(result.totalTtc).toBe(120);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(20);
  });

  it('arrondit au centime sur somme : 33.33 + 33.33 + 33.34 = 100 ttc', () => {
    const result = computeFactureTotauxTtcInclus(
      [
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.34 },
      ],
      20,
    );
    expect(result.totalTtc).toBe(100);
    expect(result.totalHt).toBe(83.33);
    expect(result.montantTva).toBe(16.67);
  });

  it('TVA 5.5% (taux reduit)', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 105.5 }],
      5.5,
    );
    expect(result.totalTtc).toBe(105.5);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(5.5);
  });

  it('TVA 0% : ht = ttc', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 100 }],
      0,
    );
    expect(result.totalTtc).toBe(100);
    expect(result.totalHt).toBe(100);
    expect(result.montantTva).toBe(0);
  });

  it('ligne HT calculee par event', () => {
    const result = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 60 }, { montant_commissionne: 60 }],
      20,
    );
    expect(result.totalTtc).toBe(120);
    expect(result.totalHt).toBe(100);
    expect(result.lignesHt).toEqual([50, 50]);
  });

  it('ecart d arrondi : SUM(lignesHt) peut differer de totalHt de quelques centimes', () => {
    // 3 evenements 33.33 + 33.33 + 33.34 = 100 TTC a 20%
    // totalHt arrondi globalement = 83.33
    // lignesHt arrondies individuellement = [27.78, 27.78, 27.78] = 83.34
    // Ecart documente : 1 centime.
    const result = computeFactureTotauxTtcInclus(
      [
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.33 },
        { montant_commissionne: 33.34 },
      ],
      20,
    );
    const sumLignes =
      Math.round(result.lignesHt.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(Math.abs(sumLignes - result.totalHt)).toBeLessThanOrEqual(
      0.01 * result.lignesHt.length,
    );
  });

  it('cas vide : totaux = 0', () => {
    const result = computeFactureTotauxTtcInclus([], 20);
    expect(result.totalTtc).toBe(0);
    expect(result.totalHt).toBe(0);
    expect(result.montantTva).toBe(0);
    expect(result.lignesHt).toEqual([]);
  });
});
