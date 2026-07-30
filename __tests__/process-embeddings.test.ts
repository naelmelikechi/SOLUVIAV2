import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  truncateForEmbedding,
} from '@/lib/process/embeddings';

describe('truncateForEmbedding', () => {
  it('laisse un texte court intact', () => {
    expect(truncateForEmbedding('court')).toBe('court');
  });
  it('tronque un texte trop long à 16000 caractères', () => {
    const long = 'a'.repeat(20000);
    expect(truncateForEmbedding(long).length).toBe(16000);
  });
});

describe('cosineSimilarity', () => {
  it('vaut 1 pour deux vecteurs identiques', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  it('vaut 0 pour deux vecteurs orthogonaux', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('classe le plus proche en premier', () => {
    const q = [1, 1];
    const a = cosineSimilarity(q, [1, 0.9]);
    const b = cosineSimilarity(q, [-1, 1]);
    expect(a).toBeGreaterThan(b);
  });
  it('renvoie 0 si un vecteur est nul', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
