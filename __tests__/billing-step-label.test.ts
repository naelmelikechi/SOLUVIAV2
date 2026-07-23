import { describe, it, expect } from 'vitest';
import {
  billingStepLabel,
  factureContenuLabel,
} from '@/lib/utils/billing-step-label';

describe('billingStepLabel', () => {
  it('engagement -> Engagement (étape 1)', () => {
    expect(billingStepLabel('engagement', null)).toBe('Engagement (étape 1)');
  });

  it('opco_step avec step -> Échéance n°N', () => {
    expect(billingStepLabel('opco_step', 2)).toBe('Échéance n°2');
    expect(billingStepLabel('opco_step', 3)).toBe('Échéance n°3');
  });

  it('opco_step sans step -> Échéance (fallback)', () => {
    expect(billingStepLabel('opco_step', null)).toBe('Échéance');
  });
});

describe('factureContenuLabel', () => {
  it('null si aucune ligne event', () => {
    expect(factureContenuLabel([])).toBeNull();
    expect(
      factureContenuLabel([{ event_type: null, mois_relatif: null }]),
    ).toBeNull();
  });

  it('Engagement si uniquement des lignes engagement', () => {
    expect(
      factureContenuLabel([
        { event_type: 'engagement', mois_relatif: 0 },
        { event_type: 'engagement', mois_relatif: 0 },
      ]),
    ).toBe('Engagement');
  });

  it('Échéance n°N si un seul step distinct', () => {
    expect(
      factureContenuLabel([
        { event_type: 'opco_step', mois_relatif: 2 },
        { event_type: 'opco_step', mois_relatif: 2 },
      ]),
    ).toBe('Échéance n°2');
  });

  it('Échéances si plusieurs steps distincts', () => {
    expect(
      factureContenuLabel([
        { event_type: 'opco_step', mois_relatif: 2 },
        { event_type: 'opco_step', mois_relatif: 3 },
      ]),
    ).toBe('Échéances');
  });

  it('Échéance (générique) si step 0 - step Eduvia non numéroté', () => {
    expect(
      factureContenuLabel([{ event_type: 'opco_step', mois_relatif: 0 }]),
    ).toBe('Échéance');
  });

  it('Mixte si engagement + échéances', () => {
    expect(
      factureContenuLabel([
        { event_type: 'engagement', mois_relatif: 0 },
        { event_type: 'opco_step', mois_relatif: 2 },
      ]),
    ).toBe('Mixte');
  });

  it('ignore les lignes sans event_type (manuelles) melangees a des events', () => {
    expect(
      factureContenuLabel([
        { event_type: null, mois_relatif: null },
        { event_type: 'engagement', mois_relatif: 0 },
      ]),
    ).toBe('Engagement');
  });
});
