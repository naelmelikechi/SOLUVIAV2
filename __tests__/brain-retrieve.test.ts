import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { retrieveNotes } from '@/lib/brain/retrieve';

function row(path: string, links: string[] = []) {
  return {
    path,
    type: 'fiche',
    title: path,
    aliases: [],
    tags: [],
    links,
    body: 'b',
    frontmatter: {},
    source_ref: null,
    source_hash: null,
  };
}

// Client factice : rpc renvoie les graines, .in() renvoie les notes liées.
function fakeDb(seeds: unknown[], linked: unknown[]) {
  return {
    rpc: async () => ({ data: seeds, error: null }),
    from: () => ({
      select: () => ({ in: async () => ({ data: linked, error: null }) }),
    }),
  } as unknown as SupabaseClient;
}

describe('retrieveNotes', () => {
  it('renvoie [] pour une question vide', async () => {
    const notes = await retrieveNotes('  ', { db: fakeDb([], []) });
    expect(notes).toEqual([]);
  });

  it('graines + expansion 1 saut, dédupliqué', async () => {
    const db = fakeDb(
      [row('fiches/a.md', ['entites/opco'])],
      [row('entites/opco.md')],
    );
    const notes = await retrieveNotes('opco', { db });
    const paths = notes.map((n) => n.path);
    expect(paths).toContain('fiches/a.md');
    expect(paths).toContain('entites/opco.md');
    expect(paths).toHaveLength(2);
  });

  it('exclut les notes marquées stale', async () => {
    const stale = {
      ...row('conversations/vieux.md'),
      frontmatter: { stale: true },
    };
    const db = fakeDb([row('fiches/a.md'), stale], []);
    const notes = await retrieveNotes('x', { db });
    const paths = notes.map((n) => n.path);
    expect(paths).toContain('fiches/a.md');
    expect(paths).not.toContain('conversations/vieux.md');
  });

  it('utilise le client fourni (plus de client admin implicite)', async () => {
    let called = false;
    const db = {
      rpc: async () => {
        called = true;
        return { data: [row('fiches/a.md')], error: null };
      },
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    } as unknown as SupabaseClient;
    await retrieveNotes('opco', { db });
    expect(called).toBe(true);
  });
});
