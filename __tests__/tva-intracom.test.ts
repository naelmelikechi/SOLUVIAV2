import { describe, it, expect } from 'vitest';
import { resolveTvaRegime } from '@/lib/utils/tva-intracom';

// Enjeu LEGAL : determine le taux TVA d'une vente B2B (FR/hors-UE = 20%,
// UE non-FR = 0% autoliquidation Art. 283-2 CGI). Utilise sur le PDF facture,
// le push Odoo et les 3 chemins de creation de facture. Une regression =
// facture a un mauvais taux + mention legale erronee.
describe('resolveTvaRegime', () => {
  it('client francais -> TVA 20%, pas d autoliquidation', () => {
    expect(resolveTvaRegime('FR14489088971')).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: 'FR',
    });
  });

  it('client UE non-FR -> TVA 0% + autoliquidation', () => {
    expect(resolveTvaRegime('BE0123456789')).toEqual({
      taux: 0,
      isAutoliquidation: true,
      countryCode: 'BE',
    });
    // Grece = code 'EL' (pas 'GR') cote TVA intracom
    expect(resolveTvaRegime('EL123456789')).toEqual({
      taux: 0,
      isAutoliquidation: true,
      countryCode: 'EL',
    });
  });

  it('null / vide -> defaut domestique 20%', () => {
    expect(resolveTvaRegime(null)).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: null,
    });
    expect(resolveTvaRegime(undefined)).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: null,
    });
    expect(resolveTvaRegime('   ')).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: null,
    });
  });

  it('insensible aux espaces et a la casse', () => {
    expect(resolveTvaRegime('  de 811 569 869 ')).toEqual({
      taux: 0,
      isAutoliquidation: true,
      countryCode: 'DE',
    });
  });

  it('LIMITE : GB post-Brexit n est PAS UE -> 20% domestique (pas d exoneration)', () => {
    // Regression critique : si 'GB' etait traite comme UE, on exonererait a tort.
    expect(resolveTvaRegime('GB123456789')).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: 'GB',
    });
  });

  it('LIMITE : pays hors-UE (CH) -> 20% domestique, countryCode renseigne', () => {
    expect(resolveTvaRegime('CH123456')).toEqual({
      taux: 20,
      isAutoliquidation: false,
      countryCode: 'CH',
    });
  });
});
