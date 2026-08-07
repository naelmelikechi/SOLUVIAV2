import { describe, it, expect } from 'vitest';
import {
  DEFAUT_RETENTION_EMAILS_MOIS,
  dateLimiteRetention,
  parseRetentionMois,
} from '@/lib/email/retention';

describe('parseRetentionMois', () => {
  it('lit une valeur valide', () => {
    expect(parseRetentionMois('12')).toBe(12);
  });

  it('retombe sur le defaut si le parametre est absent ou vide', () => {
    expect(parseRetentionMois(null)).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
    expect(parseRetentionMois(undefined)).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
    expect(parseRetentionMois('   ')).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
  });

  it('refuse une valeur qui rendrait la purge destructrice ou inerte', () => {
    // 0 effacerait tout le journal, un negatif purgerait le futur, un texte
    // n'a aucun sens. Dans les trois cas on garde la retention par defaut.
    expect(parseRetentionMois('0')).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
    expect(parseRetentionMois('-6')).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
    expect(parseRetentionMois('douze')).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
    expect(parseRetentionMois('1.5')).toBe(DEFAUT_RETENTION_EMAILS_MOIS);
  });
});

describe('dateLimiteRetention', () => {
  it('recule du nombre de mois demande', () => {
    const limite = dateLimiteRetention(24, new Date('2026-08-07T00:00:00Z'));
    expect(limite).toBe('2024-08-07T00:00:00.000Z');
  });

  it('gere un passage d annee', () => {
    const limite = dateLimiteRetention(6, new Date('2026-03-15T12:00:00Z'));
    expect(limite.slice(0, 10)).toBe('2025-09-15');
  });
});
