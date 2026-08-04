import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncBrainFiches } from '@/lib/brain/sync';
import type { FinalizedFiche } from '@/lib/process/types';

function fiche(id: string, hash: string): FinalizedFiche {
  return {
    fiche_id: id,
    mission_code: 'A',
    mission_nom: 'Lancement',
    fiche_code: 'A.1',
    titre: 'Cadrage',
    priorite: null,
    contenu: 'x',
    content_hash: hash,
    detail: {
      mission: { code: 'A', nom: 'Lancement' },
      fiche: {
        code: 'A.1',
        titre: 'Cadrage',
        description: null,
        priorite: null,
        statut: null,
      },
      taches: [],
    },
    detail_hash: 'd',
  };
}

// Admin factice : select renvoie `existing`, upsert enregistre les appels.
function fakeAdmin(
  existing: Array<{ source_ref: string; source_hash: string }>,
) {
  const upserts: unknown[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, upserts };
}

const analysis = {
  title: 'T',
  summary: 'S',
  key_points: [],
  entities: [],
  aliases: [],
  tags: [],
};

describe('syncBrainFiches', () => {
  it('saute une fiche au hash inchangé (0 analyse, 0 écriture)', async () => {
    const { admin, upserts } = fakeAdmin([
      { source_ref: '1', source_hash: 'h1' },
    ]);
    const analyze = vi.fn(async () => analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'h1')],
      analyze,
      putNote,
      admin,
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(putNote).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(res).toEqual({ analyzed: 0, skipped: 1, failed: 0 });
  });

  it('analyse + écrit une fiche nouvelle/modifiée', async () => {
    const { admin, upserts } = fakeAdmin([
      { source_ref: '1', source_hash: 'OLD' },
    ]);
    const analyze = vi.fn(async () => analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'NEW')],
      analyze,
      putNote,
      admin,
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(putNote).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect(res).toEqual({ analyzed: 1, skipped: 0, failed: 0 });
  });

  it("une analyse qui throw n'interrompt pas les autres", async () => {
    const { admin } = fakeAdmin([]);
    const analyze = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'a'), fiche('2', 'b')],
      analyze,
      putNote,
      admin,
    });
    expect(res).toEqual({ analyzed: 1, skipped: 0, failed: 1 });
  });
});
