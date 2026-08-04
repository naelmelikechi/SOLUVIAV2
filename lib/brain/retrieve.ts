import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrainNote, BrainNoteType } from './types';

const SEED_K = 6;
const MAX_NOTES = 8;

interface Row {
  path: string;
  type: string;
  title: string;
  aliases: string[];
  tags: string[];
  links: string[];
  body: string;
  frontmatter: Record<string, unknown>;
  source_ref: string | null;
  source_hash: string | null;
}

const COLS =
  'path, type, title, aliases, tags, links, body, frontmatter, source_ref, source_hash';

function toNote(r: Row): BrainNote {
  return { ...r, type: r.type as BrainNoteType };
}

/**
 * Retrouve les notes pertinentes : graines pg_trgm + expansion 1 saut via les
 * liens sortants. Utilise le client admin (RLS brain_notes = admin only).
 */
export async function retrieveNotes(
  question: string,
  deps: { admin: SupabaseClient },
): Promise<BrainNote[]> {
  const q = question.trim();
  if (!q) return [];
  const { admin } = deps;

  const { data: seeds, error } = await admin.rpc('search_brain_trgm', {
    q,
    k: SEED_K,
  });
  if (error) {
    console.error('[brain/retrieve] trgm:', error.message);
    return [];
  }
  const seedRows = (seeds as Row[]) ?? [];
  const byPath = new Map<string, Row>(seedRows.map((r) => [r.path, r]));

  const linkTargets = [...new Set(seedRows.flatMap((r) => r.links ?? []))];
  if (linkTargets.length) {
    const targetPaths = linkTargets.map((t) => `${t}.md`);
    const { data: linked } = await admin
      .from('brain_notes')
      .select(COLS)
      .in('path', targetPaths);
    for (const r of (linked as Row[]) ?? []) {
      if (!byPath.has(r.path)) byPath.set(r.path, r);
    }
  }

  return [...byPath.values()].slice(0, MAX_NOTES).map(toNote);
}
