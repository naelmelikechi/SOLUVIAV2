import { describe, it, expect } from 'vitest';
import { computeSanteProspect } from '@/lib/utils/sante-prospect';

// `now` figé : 15 juin 2026 à midi (heure locale). Les dates de test sont
// construites par décalage en jours *calendaires* — exactement ce que mesure
// `differenceInCalendarDays`, donc indépendant de l'heure et de la DST.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

// Date à exactement `n` jours calendaires avant NOW (même heure locale).
// JS normalise les jours-du-mois négatifs (15 - 40 → fin mai), donc robuste.
function joursAvant(n: number): Date {
  return new Date(2026, 5, 15 - n, 12, 0, 0);
}

describe('computeSanteProspect', () => {
  it("renvoie 'vert' pour 0 jour (action aujourd'hui)", () => {
    expect(computeSanteProspect(joursAvant(0), NOW)).toBe('vert');
  });

  it("reste 'vert' à la borne haute du vert (7 jours inclus)", () => {
    expect(computeSanteProspect(joursAvant(7), NOW)).toBe('vert');
  });

  it("bascule en 'orange' dès 8 jours (borne basse orange)", () => {
    expect(computeSanteProspect(joursAvant(8), NOW)).toBe('orange');
  });

  it("reste 'orange' à la borne haute (14 jours inclus)", () => {
    expect(computeSanteProspect(joursAvant(14), NOW)).toBe('orange');
  });

  it("bascule en 'rouge' dès 15 jours (borne basse rouge)", () => {
    expect(computeSanteProspect(joursAvant(15), NOW)).toBe('rouge');
  });

  it("reste 'rouge' bien au-delà (40 jours)", () => {
    expect(computeSanteProspect(joursAvant(40), NOW)).toBe('rouge');
  });

  it("accepte une chaîne ISO autant qu'un objet Date", () => {
    expect(computeSanteProspect(joursAvant(3).toISOString(), NOW)).toBe('vert');
    expect(computeSanteProspect(joursAvant(20).toISOString(), NOW)).toBe(
      'rouge',
    );
  });

  it("renvoie 'rouge' quand la date est absente (null / undefined)", () => {
    expect(computeSanteProspect(null, NOW)).toBe('rouge');
    expect(computeSanteProspect(undefined, NOW)).toBe('rouge');
  });

  it("renvoie 'rouge' pour une date invalide", () => {
    expect(computeSanteProspect('pas-une-date', NOW)).toBe('rouge');
    expect(computeSanteProspect(new Date('nope'), NOW)).toBe('rouge');
  });
});
