import { describe, it, expect, vi } from 'vitest';
import { rankResults, searchProcess } from '@/lib/process/search';

const ROWS = [
  {
    source_fiche_id: '1',
    mission_nom: 'M1',
    titre: 'Facturation',
    contenu: 'comment facturer un client',
    url: 'u1',
    embedding: [1, 0],
  },
  {
    source_fiche_id: '2',
    mission_nom: 'M2',
    titre: 'Congés',
    contenu: 'poser des congés',
    url: 'u2',
    embedding: [0, 1],
  },
];

describe('rankResults', () => {
  it('classe par cosinus décroissant et applique le snippet + la limite', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = rankResults(ROWS as any, [1, 0], 'facturer', 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.source_fiche_id).toBe('1');
    expect(out[0]!.mission).toBe('M1');
    expect(out[0]!.snippet.toLowerCase()).toContain('facturer');
    expect(out[0]!.score).toBeGreaterThan(0.9);
  });
});

describe('searchProcess', () => {
  it("bascule sur le fallback trgm quand l'embedding de la requête échoue", async () => {
    const rpc = vi.fn(async () => ({ data: ROWS, error: null }));
    const admin = {
      from: () => ({
        select: () => Promise.resolve({ data: ROWS, error: null }),
      }),
      rpc,
    };
    const res = await searchProcess('facturer', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      embedQuery: async () => {
        throw new Error('openai down');
      },
    });
    expect(rpc).toHaveBeenCalledWith('search_process_trgm', { q: 'facturer' });
    expect(res.length).toBeGreaterThan(0);
  });
});
