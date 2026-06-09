import { describe, it, expect } from 'vitest';
import {
  subtractDaysIso,
  addDaysIso,
  toLocalISODate,
  currentMondayLocalISO,
  currentFridayLocalISO,
  diffDaysIso,
} from '@/lib/utils/dates';

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

// ---------------------------------------------------------------------------
// Helpers TZ-LOCAUX (sprint 5 #4) - utilises par les hooks client.
// ---------------------------------------------------------------------------
// Construits via `new Date(y, m, d, h, mn)` qui reste en TZ locale, donc
// l'invariant verifie est "le helper retourne la date LOCALE", independant
// du fuseau du runner.

describe('toLocalISODate', () => {
  it('formate une Date locale en YYYY-MM-DD sans shift TZ', () => {
    const d = new Date(2026, 4, 7, 14, 30); // 2026-05-07 14:30 local
    expect(toLocalISODate(d)).toBe('2026-05-07');
  });

  it('pad mois et jour 1 chiffre', () => {
    const d = new Date(2026, 0, 5, 9, 0); // 2026-01-05 09:00 local
    expect(toLocalISODate(d)).toBe('2026-01-05');
  });
});

describe('currentMondayLocalISO (#4 TZ bug badges)', () => {
  it('lundi matin -> meme lundi', () => {
    const monday = new Date(2026, 4, 4, 9, 0);
    expect(currentMondayLocalISO(monday)).toBe('2026-05-04');
  });

  it('lundi 00:30 local -> meme lundi (REGRESSION GUARD : ancien code rendait dimanche en UTC)', () => {
    // Avant fix : new Date(...).toISOString().slice(0,10) convertit en UTC,
    // et 00:30 local Paris = 22:30 UTC veille -> renvoyait dimanche.
    const earlyMonday = new Date(2026, 4, 4, 0, 30);
    expect(currentMondayLocalISO(earlyMonday)).toBe('2026-05-04');
  });

  it('vendredi -> lundi de la meme semaine', () => {
    const friday = new Date(2026, 4, 8, 16, 0);
    expect(currentMondayLocalISO(friday)).toBe('2026-05-04');
  });

  it('dimanche -> lundi precedent (semaine qu on vient de finir, comme l ancien code)', () => {
    const sunday = new Date(2026, 4, 10, 14, 0);
    expect(currentMondayLocalISO(sunday)).toBe('2026-05-04');
  });

  it('samedi -> lundi precedent', () => {
    const saturday = new Date(2026, 4, 9, 10, 0);
    expect(currentMondayLocalISO(saturday)).toBe('2026-05-04');
  });
});

describe('currentFridayLocalISO', () => {
  it('lundi -> vendredi suivant', () => {
    const monday = new Date(2026, 4, 4, 9, 0);
    expect(currentFridayLocalISO(monday)).toBe('2026-05-08');
  });

  it('vendredi -> meme vendredi', () => {
    const friday = new Date(2026, 4, 8, 16, 0);
    expect(currentFridayLocalISO(friday)).toBe('2026-05-08');
  });

  it('dimanche -> vendredi precedent (semaine qu on vient de finir)', () => {
    const sunday = new Date(2026, 4, 10, 14, 0);
    expect(currentFridayLocalISO(sunday)).toBe('2026-05-08');
  });
});

describe('diffDaysIso (UTC-safe)', () => {
  it('compte les jours entre deux dates ISO', () => {
    expect(diffDaysIso('2026-06-08', '2026-06-15')).toBe(7);
    expect(diffDaysIso('2026-06-08', '2026-06-08')).toBe(0);
  });

  it('traverse les bornes de mois et d annee', () => {
    expect(diffDaysIso('2026-01-28', '2026-02-04')).toBe(7);
    expect(diffDaysIso('2026-12-31', '2027-01-07')).toBe(7);
  });

  it('gere les annees bissextiles', () => {
    expect(diffDaysIso('2024-02-25', '2024-03-03')).toBe(7);
  });

  it('reste stable au passage heure ete (DST Europe/Paris)', () => {
    // 29 mars 2026 = bascule heure d ete ; en UTC strict ca ne change rien.
    expect(diffDaysIso('2026-03-22', '2026-03-30')).toBe(8);
  });

  it('renvoie un nombre negatif si to < from', () => {
    expect(diffDaysIso('2026-06-15', '2026-06-08')).toBe(-7);
  });
});
