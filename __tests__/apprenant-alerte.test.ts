import { describe, it, expect } from 'vitest';
import {
  isApprenantEnAlerte,
  ETATS_CONTRAT_NON_ENGAGE,
} from '@/lib/utils/apprenant-alerte';

const AUJOURD_HUI = '2026-08-05';

describe('isApprenantEnAlerte', () => {
  it('alerte quand la formation a demarre et que le contrat est au brouillon', () => {
    expect(isApprenantEnAlerte('2026-06-01', 'NOTSENT', AUJOURD_HUI)).toBe(
      true,
    );
  });

  it('alerte quand la formation a demarre et que le contrat est archive', () => {
    expect(isApprenantEnAlerte('2026-06-01', 'ARCHIVE', AUJOURD_HUI)).toBe(
      true,
    );
  });

  it("pas d'alerte si la date de debut est dans le futur", () => {
    expect(isApprenantEnAlerte('2026-09-01', 'NOTSENT', AUJOURD_HUI)).toBe(
      false,
    );
  });

  it("pas d'alerte le jour meme du demarrage", () => {
    expect(isApprenantEnAlerte(AUJOURD_HUI, 'NOTSENT', AUJOURD_HUI)).toBe(
      false,
    );
  });

  it('alerte des la veille du jour courant', () => {
    expect(isApprenantEnAlerte('2026-08-04', 'NOTSENT', AUJOURD_HUI)).toBe(
      true,
    );
  });

  it("pas d'alerte sur les etats d'instruction normaux", () => {
    for (const etat of ['ENGAGE', 'TRANSMIS', 'EN_COURS_INSTRUCTION']) {
      expect(isApprenantEnAlerte('2026-06-01', etat, AUJOURD_HUI)).toBe(false);
    }
  });

  it("pas d'alerte sans date de debut (eleve sans contrat)", () => {
    expect(isApprenantEnAlerte(null, null, AUJOURD_HUI)).toBe(false);
    expect(isApprenantEnAlerte(null, 'NOTSENT', AUJOURD_HUI)).toBe(false);
  });

  it('accepte un timestamp ISO complet', () => {
    expect(
      isApprenantEnAlerte('2026-06-01T00:00:00.000Z', 'ARCHIVE', AUJOURD_HUI),
    ).toBe(true);
  });

  it('le perimetre des etats non engages reste limite a NOTSENT et ARCHIVE', () => {
    expect([...ETATS_CONTRAT_NON_ENGAGE].sort()).toEqual([
      'ARCHIVE',
      'NOTSENT',
    ]);
  });
});
