import { describe, it, expect } from 'vitest';
import {
  computeTauxAbandon,
  computeTauxFinancement,
  computePedagogieAvancement,
  groupContratsByType,
} from '@/lib/utils/kpi-computations';

describe('computeTauxAbandon', () => {
  it('renvoie 0 quand aucun contrat', () => {
    expect(computeTauxAbandon([])).toBe(0);
  });

  it('renvoie 0 quand aucun abandon', () => {
    const contrats = [
      { contract_state: 'signe' },
      { contract_state: 'ENGAGE' },
    ];
    expect(computeTauxAbandon(contrats)).toBe(0);
  });

  it('compte resilie + ANNULE comme abandons', () => {
    const contrats = [
      { contract_state: 'signe' },
      { contract_state: 'resilie' },
      { contract_state: 'ANNULE' },
      { contract_state: 'ENGAGE' },
    ];
    expect(computeTauxAbandon(contrats)).toBe(50);
  });

  it('arrondit a 2 decimales', () => {
    const contrats = [
      { contract_state: 'resilie' },
      { contract_state: 'signe' },
      { contract_state: 'signe' },
    ];
    expect(computeTauxAbandon(contrats)).toBe(33.33);
  });
});

describe('computeTauxFinancement', () => {
  it('renvoie 0 quand aucun contrat', () => {
    expect(computeTauxFinancement([], 0)).toBe(0);
  });

  it('renvoie 0 quand npec_total = 0 (evite division par zero)', () => {
    expect(computeTauxFinancement([{ npec_amount: 0 }], 0)).toBe(0);
  });

  it('calcule facture / npec_total * 100', () => {
    const contrats = [{ npec_amount: 10000 }, { npec_amount: 5000 }];
    expect(computeTauxFinancement(contrats, 6000)).toBe(40);
  });
});

describe('computePedagogieAvancement', () => {
  it('renvoie 0 quand aucun contrat', () => {
    expect(computePedagogieAvancement([])).toBe(0);
  });

  it('moyenne arithmetique des progressions', () => {
    const contrats = [
      { contrats_progressions: [{ progression_percentage: 50 }] },
      { contrats_progressions: [{ progression_percentage: 80 }] },
    ];
    expect(computePedagogieAvancement(contrats)).toBe(65);
  });

  it('ignore les contrats sans progression', () => {
    const contrats = [
      { contrats_progressions: [{ progression_percentage: 50 }] },
      { contrats_progressions: [] },
    ];
    expect(computePedagogieAvancement(contrats)).toBe(50);
  });
});

describe('groupContratsByType', () => {
  it('compte par contract_type', () => {
    const contrats = [
      { contract_type: 'APP' },
      { contract_type: 'APP' },
      { contract_type: 'PDC' },
      { contract_type: 'POE' },
      { contract_type: null },
    ];
    expect(groupContratsByType(contrats)).toEqual({
      app: 2,
      pdc: 1,
      poe: 1,
    });
  });

  it('renvoie 0 pour les types absents', () => {
    expect(groupContratsByType([{ contract_type: 'APP' }])).toEqual({
      app: 1,
      pdc: 0,
      poe: 0,
    });
  });
});
