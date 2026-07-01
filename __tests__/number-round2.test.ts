import { describe, it, expect } from 'vitest';
import { round2 } from '@/lib/utils/number';

// round2 = source UNIQUE d'arrondi centimes (HT/TVA/TTC, jalons echeancier).
// Invariant facturation : montants en centimes entiers. Valeurs verifiees
// empiriquement (comportement IEEE-754 de Math.round documente ici).
describe('round2', () => {
  it('neutralise les artefacts de flottants', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3); // pas 0.30000000000000004
    expect(round2(100.33 + 50.5)).toBe(150.83);
  });

  it('arrondit a 2 decimales', () => {
    expect(round2(150.826)).toBe(150.83);
    expect(round2(150.824)).toBe(150.82);
    expect(round2(20)).toBe(20);
  });

  it('LIMITE demi-cent : pieges IEEE-754 (documentes, non intuitifs)', () => {
    // 1.005*100 = 100.4999... en IEEE754 -> Math.round -> 100 -> 1
    expect(round2(1.005)).toBe(1);
    // 2.675*100 = 267.49999... -> 268 (ATTENTION : arrondit a 2.68, pas 2.67)
    expect(round2(2.675)).toBe(2.68);
    // 1.255*100 = 125.4999... -> 125 -> 1.25
    expect(round2(1.255)).toBe(1.25);
  });

  it('LIMITE negatif (avoirs) : Math.round arrondit la demie vers +infini', () => {
    expect(round2(-1000.005)).toBe(-1000);
    // -0.005*100 = -0.4999... -> Math.round -> -0 (zero NEGATIF en IEEE-754).
    // Numeriquement == 0 ; on documente le -0 reel (Object.is le distingue).
    expect(round2(-0.005)).toBe(-0);
    expect(round2(-12.34)).toBe(-12.34);
  });

  it('zero', () => {
    expect(round2(0)).toBe(0);
  });
});
