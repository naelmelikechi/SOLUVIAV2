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

// Admin factice : rpc renvoie les graines, .in() renvoie les notes liées.
function fakeAdmin(seeds: unknown[], linked: unknown[]) {
  return {
    rpc: async () => ({ data: seeds, error: null }),
    from: () => ({
      select: () => ({ in: async () => ({ data: linked, error: null }) }),
    }),
  } as unknown as SupabaseClient;
}

describe('retrieveNotes', () => {
  it('renvoie [] pour une question vide', async () => {
    const notes = await retrieveNotes('  ', { admin: fakeAdmin([], []) });
    expect(notes).toEqual([]);
  });

  it('graines + expansion 1 saut, dédupliqué', async () => {
    const admin = fakeAdmin(
      [row('fiches/a.md', ['entites/opco'])],
      [row('entites/opco.md')],
    );
    const notes = await retrieveNotes('opco', { admin });
    const paths = notes.map((n) => n.path);
    expect(paths).toContain('fiches/a.md');
    expect(paths).toContain('entites/opco.md');
    expect(paths).toHaveLength(2);
  });
});
