import { describe, it, expect } from 'vitest';
import {
  progressionApprenant,
  TOLERANCE_POINTS,
} from '@/lib/projets/progression';

const DEBUT = '2026-01-01';
const FIN = '2026-01-11'; // 10 jours

describe('progressionApprenant', () => {
  it('a mi-parcours, la theorique vaut 50', () => {
    const r = progressionApprenant(DEBUT, FIN, 50, '2026-01-06');
    expect(r.theorique).toBe(50);
  });

  it('avant le debut, la theorique vaut 0', () => {
    const r = progressionApprenant(DEBUT, FIN, 0, '2025-12-01');
    expect(r.theorique).toBe(0);
  });

  it('apres la fin, la theorique vaut 100, jamais plus', () => {
    const r = progressionApprenant(DEBUT, FIN, 100, '2026-06-01');
    expect(r.theorique).toBe(100);
  });

  it('debut et fin le meme jour ne divise pas par zero (jour atteint ou depasse)', () => {
    const r = progressionApprenant('2026-03-01', '2026-03-01', 0, '2026-03-01');
    expect(r.theorique).toBe(100);
    expect(Number.isFinite(r.theorique)).toBe(true);
  });

  it('debut et fin le meme jour, avant ce jour : theorique vaut 0', () => {
    const r = progressionApprenant('2026-03-01', '2026-03-01', 0, '2026-02-15');
    expect(r.theorique).toBe(0);
  });

  it('progression reelle superieure a la theorique au-dela de la tolerance -> avance', () => {
    const r = progressionApprenant(DEBUT, FIN, 80, '2026-01-06'); // theorique 50, ecart +30
    expect(r.statut).toBe('avance');
  });

  it('progression reelle inferieure a la theorique au-dela de la tolerance -> retard', () => {
    const r = progressionApprenant(DEBUT, FIN, 20, '2026-01-06'); // theorique 50, ecart -30
    expect(r.statut).toBe('retard');
  });

  it('tolerance : un ecart de 5 points reste a_jour', () => {
    const r = progressionApprenant(
      DEBUT,
      FIN,
      50 - TOLERANCE_POINTS,
      '2026-01-06',
    );
    expect(r.ecart).toBe(-5);
    expect(r.statut).toBe('a_jour');
  });

  it('tolerance : un ecart de 6 points devient un retard', () => {
    const r = progressionApprenant(
      DEBUT,
      FIN,
      50 - (TOLERANCE_POINTS + 1),
      '2026-01-06',
    );
    expect(r.ecart).toBe(-6);
    expect(r.statut).toBe('retard');
  });

  it('symetrique : un ecart de +5 reste a_jour, +6 devient avance', () => {
    const auTolerance = progressionApprenant(
      DEBUT,
      FIN,
      50 + TOLERANCE_POINTS,
      '2026-01-06',
    );
    expect(auTolerance.statut).toBe('a_jour');

    const auDela = progressionApprenant(
      DEBUT,
      FIN,
      50 + TOLERANCE_POINTS + 1,
      '2026-01-06',
    );
    expect(auDela.statut).toBe('avance');
  });

  it('progression reelle inconnue (null) -> a_jour, ecart null, jamais une alerte', () => {
    const r = progressionApprenant(DEBUT, FIN, null, '2026-01-06');
    expect(r.statut).toBe('a_jour');
    expect(r.ecart).toBeNull();
    // La theorique reste calculable : seule l'absence de reelle empeche
    // l'ecart, elle n'efface pas ce qu'on sait par ailleurs.
    expect(r.theorique).toBe(50);
  });

  it('dates manquantes -> meme traitement : a_jour, ecart null, theorique null', () => {
    const sansDebut = progressionApprenant(null, FIN, 50, '2026-01-06');
    expect(sansDebut.statut).toBe('a_jour');
    expect(sansDebut.ecart).toBeNull();
    expect(sansDebut.theorique).toBeNull();

    const sansFin = progressionApprenant(DEBUT, null, 50, '2026-01-06');
    expect(sansFin.statut).toBe('a_jour');
    expect(sansFin.ecart).toBeNull();
    expect(sansFin.theorique).toBeNull();

    const sansAucune = progressionApprenant(null, null, null, '2026-01-06');
    expect(sansAucune.statut).toBe('a_jour');
    expect(sansAucune.ecart).toBeNull();
    expect(sansAucune.theorique).toBeNull();
  });
});
