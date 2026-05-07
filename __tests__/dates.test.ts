import { describe, it, expect } from 'vitest';
import { subtractDaysIso, addDaysIso } from '@/lib/utils/dates';

describe('subtractDaysIso (UTC-safe)', () => {
  it('soustrait 7 jours sans dependre du fuseau', () => {
    expect(subtractDaysIso('2026-05-07', 7)).toBe('2026-04-30');
    expect(subtractDaysIso('2026-01-01', 7)).toBe('2025-12-25');
    expect(subtractDaysIso('2026-03-01', 7)).toBe('2026-02-22');
  });

  it('reste stable au passage heure ete (DST Europe/Paris)', () => {
    // Le dimanche 29 mars 2026 03:00 local devient 02:00 (sortie d'hiver).
    // En UTC strict cela ne doit rien changer.
    expect(subtractDaysIso('2026-03-30', 1)).toBe('2026-03-29');
    expect(subtractDaysIso('2026-03-30', 7)).toBe('2026-03-23');
  });

  it('reste stable au passage heure hiver', () => {
    // Le dimanche 25 octobre 2026 03:00 local devient 02:00 (entree hiver).
    expect(subtractDaysIso('2026-10-26', 1)).toBe('2026-10-25');
    expect(subtractDaysIso('2026-10-26', 7)).toBe('2026-10-19');
  });

  it('gere le bord d annee', () => {
    expect(subtractDaysIso('2026-01-03', 7)).toBe('2025-12-27');
  });

  it('throw sur format invalide', () => {
    expect(() => subtractDaysIso('not-a-date', 7)).toThrow();
    expect(() => subtractDaysIso('2026/05/07', 7)).toThrow();
  });
});

describe('addDaysIso', () => {
  it('ajoute des jours en UTC strict', () => {
    expect(addDaysIso('2026-04-30', 7)).toBe('2026-05-07');
    expect(addDaysIso('2025-12-25', 7)).toBe('2026-01-01');
  });

  it('addDaysIso(d, n) === subtractDaysIso(d, -n)', () => {
    expect(addDaysIso('2026-05-07', 5)).toBe(subtractDaysIso('2026-05-07', -5));
  });
});
