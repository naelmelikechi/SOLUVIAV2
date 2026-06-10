import { describe, it, expect } from 'vitest';
import {
  mapSocieteToEmetteur,
  type SocieteEmettriceRow,
} from '@/lib/queries/parametres';

// Fixture partielle : seuls les champs mappés comptent. Cast via `unknown`
// (échappatoire autorisée) car la Row complète a beaucoup d'autres colonnes.
function row(over: Partial<SocieteEmettriceRow>): SocieteEmettriceRow {
  return {
    raison_sociale: 'S.A.S. SOLUVIA',
    adresse: '27 Rue Jacqueline Cochran',
    code_postal: '79000',
    ville: 'Niort',
    siret: '994 241 537 00012',
    tva_intracom: 'FR37994241537',
    banque_iban: 'FR7611706337',
    banque_bic: 'AGRIFRPP',
    banque_nom: 'Credit Agricole',
    mentions_legales:
      'S.A.S. SOLUVIA au capital de 1 000 € - RCS Niort 994 241 537',
    ...over,
  } as unknown as SocieteEmettriceRow;
}

describe('mapSocieteToEmetteur', () => {
  it('mappe les champs aux noms distincts (le bug corrigé du cast brut)', () => {
    const e = mapSocieteToEmetteur(row({}));
    expect(e.tva).toBe('FR37994241537'); // tva_intracom -> tva
    expect(e.iban).toBe('FR7611706337'); // banque_iban -> iban
    expect(e.bic).toBe('AGRIFRPP'); // banque_bic -> bic
    expect(e.banque).toBe('Credit Agricole'); // banque_nom -> banque
  });

  it('compose l adresse complète (rue, CP ville)', () => {
    const e = mapSocieteToEmetteur(row({}));
    expect(e.adresse).toBe('27 Rue Jacqueline Cochran, 79000 Niort');
  });

  it('reporte raison_sociale, siret, titulaire et mentions légales', () => {
    const e = mapSocieteToEmetteur(row({}));
    expect(e.raison_sociale).toBe('S.A.S. SOLUVIA');
    expect(e.siret).toBe('994 241 537 00012');
    expect(e.titulaire_compte).toBe('S.A.S. SOLUVIA');
    expect(e.mentions_legales).toContain('RCS Niort 994 241 537');
    expect(e.mentions_legales).toContain('capital de 1 000');
  });
});
