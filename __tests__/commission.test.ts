import { describe, it, expect } from 'vitest';
import {
  TAUX_COMMISSION_DEFAUT,
  resolveTauxCommission,
  isTauxCommissionDefaut,
} from '@/lib/utils/commission';

describe('resolveTauxCommission', () => {
  it('retourne la valeur si fournie', () => {
    expect(resolveTauxCommission(40)).toBe(40);
    expect(resolveTauxCommission('55')).toBe(55);
  });

  it('retombe sur le defaut UNIQUEMENT si null/undefined/NaN', () => {
    expect(resolveTauxCommission(null)).toBe(TAUX_COMMISSION_DEFAUT);
    expect(resolveTauxCommission(undefined)).toBe(TAUX_COMMISSION_DEFAUT);
    expect(resolveTauxCommission(Number.NaN)).toBe(TAUX_COMMISSION_DEFAUT);
  });

  it('conserve un taux explicite de 0 % (projets libres/internes)', () => {
    // Ne PAS transformer 0 en 10 : comportement identique a l'ancien `?? 10`.
    expect(resolveTauxCommission(0)).toBe(0);
  });
});

describe('isTauxCommissionDefaut', () => {
  it('vrai si absent ou egal au defaut', () => {
    expect(isTauxCommissionDefaut(null)).toBe(true);
    expect(isTauxCommissionDefaut(TAUX_COMMISSION_DEFAUT)).toBe(true);
  });
  it('faux si taux specifique', () => {
    expect(isTauxCommissionDefaut(40)).toBe(false);
    expect(isTauxCommissionDefaut(55)).toBe(false);
  });
});
