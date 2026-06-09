import { describe, it, expect } from 'vitest';
import {
  getDelaiEcheanceJours,
  DEFAULT_DELAI_ECHEANCE_JOURS,
} from '@/lib/queries/parametres';
import { reglementParDefaut } from '@/lib/utils/facture-reglement';

/**
 * Couvre la nouvelle source de verite de l'echeance par defaut :
 * date_echeance = date_emission + getDelaiEcheanceJours().
 *
 * On stub le client supabase (le helper le prend en parametre) pour controler
 * la valeur du parametre facturation.delai_echeance_jours sans DB.
 */
function stubSupabase(row: { valeur: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof getDelaiEcheanceJours>[0];
}

describe('getDelaiEcheanceJours', () => {
  it('lit la valeur du parametre (entier >= 0)', async () => {
    expect(await getDelaiEcheanceJours(stubSupabase({ valeur: '7' }))).toBe(7);
    expect(await getDelaiEcheanceJours(stubSupabase({ valeur: '30' }))).toBe(
      30,
    );
    expect(await getDelaiEcheanceJours(stubSupabase({ valeur: '0' }))).toBe(0);
  });

  it('fallback sur le defaut si absent / vide / invalide (jamais bloquant)', async () => {
    expect(await getDelaiEcheanceJours(stubSupabase(null))).toBe(
      DEFAULT_DELAI_ECHEANCE_JOURS,
    );
    for (const valeur of ['', '   ', 'abc', '-5', '7.5', 'NaN']) {
      expect(await getDelaiEcheanceJours(stubSupabase({ valeur }))).toBe(
        DEFAULT_DELAI_ECHEANCE_JOURS,
      );
    }
  });

  it('le defaut est 7 jours', () => {
    expect(DEFAULT_DELAI_ECHEANCE_JOURS).toBe(7);
  });
});

describe('reglementParDefaut', () => {
  it('derive "sous N jours" des dates emission/echeance', () => {
    expect(reglementParDefaut('2026-06-08', '2026-06-15')).toBe(
      'Règlement par virement bancaire sous 7 jours.',
    );
    expect(reglementParDefaut('2026-06-08', '2026-07-08')).toBe(
      'Règlement par virement bancaire sous 30 jours.',
    );
  });

  it('texte generique si dates manquantes ou delai <= 0 (avoir jour meme)', () => {
    expect(reglementParDefaut(null, '2026-06-15')).toBe(
      'Règlement par virement bancaire.',
    );
    expect(reglementParDefaut('2026-06-15', null)).toBe(
      'Règlement par virement bancaire.',
    );
    expect(reglementParDefaut('2026-06-15', '2026-06-15')).toBe(
      'Règlement par virement bancaire.',
    );
  });
});
