import { describe, it, expect } from 'vitest';
import { normalizeUnlockAttempt } from '@/lib/utils/avatar';

describe('normalizeUnlockAttempt', () => {
  it('ramène toutes les variantes de la bonne réponse à la même forme', () => {
    const canonical = normalizeUnlockAttempt('fideleavie');
    expect(normalizeUnlockAttempt('Fidèle à vie')).toBe(canonical);
    expect(normalizeUnlockAttempt('fidele-a-vie')).toBe(canonical);
    expect(normalizeUnlockAttempt('  FIDÈLE  À  VIE !! ')).toBe(canonical);
    expect(normalizeUnlockAttempt('Fidèle, à vie.')).toBe(canonical);
  });

  it('produit bien "fideleavie" pour la réponse', () => {
    expect(normalizeUnlockAttempt('Fidèle à vie')).toBe('fideleavie');
  });

  it('retire accents, casse et ponctuation', () => {
    expect(normalizeUnlockAttempt('Éà-ç_ 9!')).toBe('eac9');
  });

  it('distingue une réponse différente', () => {
    expect(normalizeUnlockAttempt('autre chose')).not.toBe(
      normalizeUnlockAttempt('fidele a vie'),
    );
  });

  it('réduit une saisie vide ou purement symbolique à une chaîne vide', () => {
    expect(normalizeUnlockAttempt('   ')).toBe('');
    expect(normalizeUnlockAttempt('!!!---')).toBe('');
  });
});
