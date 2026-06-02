import { describe, it, expect } from 'vitest';
import { htRatio, encaisseHt } from '@/lib/utils/montant-ht';

describe('htRatio', () => {
  it('TVA 20% : 120 ttc -> ratio 100/120', () => {
    expect(htRatio(100, 120)).toBeCloseTo(0.8333, 4);
  });

  it('TVA 0% intracom : ht=ttc -> ratio 1', () => {
    expect(htRatio(500, 500)).toBe(1);
  });

  it('ttc=0 (facture 0€ / anomalie) -> ratio 1, pas de division par zéro', () => {
    expect(htRatio(0, 0)).toBe(1);
  });
});

describe('encaisseHt', () => {
  it('paiement complet 120 TTC sur facture 100 HT -> 100 HT', () => {
    expect(encaisseHt(120, 100, 120)).toBeCloseTo(100, 6);
  });

  it('paiement partiel 60 TTC sur facture 100 HT / 120 TTC -> 50 HT', () => {
    expect(encaisseHt(60, 100, 120)).toBeCloseTo(50, 6);
  });

  it('intracom 0% : 500 TTC = 500 HT', () => {
    expect(encaisseHt(500, 500, 500)).toBe(500);
  });

  it('ttc=0 : encaissé passe en HT à l’identique', () => {
    expect(encaisseHt(80, 0, 0)).toBe(80);
  });
});
