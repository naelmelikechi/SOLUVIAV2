import { describe, it, expect } from 'vitest';
import {
  CATEGORIES_INTERNES,
  getCategorieInterneLabel,
} from '@/lib/utils/projets-internes';

describe('getCategorieInterneLabel', () => {
  it('retourne le label francais pour chaque categorie connue', () => {
    expect(getCategorieInterneLabel('formation')).toBe('Formation interne');
    expect(getCategorieInterneLabel('intercontrat')).toBe('Intercontrat');
    expect(getCategorieInterneLabel('support_transverse')).toBe(
      'Support transverse',
    );
    expect(getCategorieInterneLabel('dev_outils')).toBe('Dev outils internes');
    expect(getCategorieInterneLabel('r_et_d')).toBe('R&D / veille');
    expect(getCategorieInterneLabel('prise_de_poste')).toBe('Prise de poste');
  });

  it('retourne la valeur brute si categorie inconnue (fallback gracieux)', () => {
    expect(getCategorieInterneLabel('mystere')).toBe('mystere');
  });

  it('retourne chaine vide pour null/undefined', () => {
    expect(getCategorieInterneLabel(null)).toBe('');
    expect(getCategorieInterneLabel(undefined)).toBe('');
    expect(getCategorieInterneLabel('')).toBe('');
  });
});

describe('CATEGORIES_INTERNES', () => {
  it('contient exactement les 6 categories metier', () => {
    expect(CATEGORIES_INTERNES).toEqual([
      'formation',
      'intercontrat',
      'support_transverse',
      'dev_outils',
      'r_et_d',
      'prise_de_poste',
    ]);
  });
});
