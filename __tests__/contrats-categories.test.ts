import { describe, it, expect } from 'vitest';
import {
  categorieContrat,
  CATEGORIES_CONTRAT,
} from '@/lib/contrats/categories';

describe('categorieContrat', () => {
  it('classe les brouillons en prevus de rentrer', () => {
    expect(categorieContrat('NOTSENT', false)).toBe('prevus');
  });

  it('classe les trois etats d instruction en deposes', () => {
    expect(categorieContrat('TRANSMIS', false)).toBe('deposes');
    expect(categorieContrat('EN_COURS_INSTRUCTION', false)).toBe('deposes');
    expect(categorieContrat('ENGAGE', false)).toBe('deposes');
  });

  it('donne sa propre categorie a la rupture', () => {
    expect(categorieContrat('RUPTURE', false)).toBe('ruptures');
  });

  it('donne sa propre categorie a l annulation', () => {
    expect(categorieContrat('ANNULE', false)).toBe('annules');
  });

  it('classe l etat ARCHIVE en archives', () => {
    expect(categorieContrat('ARCHIVE', false)).toBe('archives');
  });

  it('le drapeau archive prime sur tous les etats', () => {
    // Un contrat archive a la main ou par le cron sort de la production,
    // quel que soit ce que dit encore Eduvia.
    expect(categorieContrat('ENGAGE', true)).toBe('archives');
    expect(categorieContrat('NOTSENT', true)).toBe('archives');
    expect(categorieContrat('RUPTURE', true)).toBe('archives');
  });

  it('rattache les etats internes historiques a une categorie plausible', () => {
    expect(categorieContrat('actif', false)).toBe('deposes');
    expect(categorieContrat('termine', false)).toBe('deposes');
    expect(categorieContrat('resilie', false)).toBe('ruptures');
    expect(categorieContrat('suspendu', false)).toBe('ruptures');
  });

  it('range un etat inconnu dans deposes plutot que de le faire disparaitre', () => {
    // Un etat non reconnu doit rester visible : le perdre reviendrait a
    // masquer un contrat au CDP sans qu'il le sache.
    expect(categorieContrat('ETAT_INEDIT', false)).toBe('deposes');
    expect(categorieContrat(null, false)).toBe('deposes');
  });

  it('expose les cinq categories dans l ordre d affichage', () => {
    expect(CATEGORIES_CONTRAT.map((c) => c.cle)).toEqual([
      'prevus',
      'deposes',
      'ruptures',
      'annules',
      'archives',
    ]);
  });

  it('donne un libelle a chaque categorie', () => {
    for (const c of CATEGORIES_CONTRAT) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});
