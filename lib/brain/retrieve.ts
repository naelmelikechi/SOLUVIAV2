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
 * liens sortants.
 *
 * Passe par le client de l'UTILISATEUR : la RLS de `brain_notes` (select ouvert
 * à `authenticated` depuis la migration 20260805100000) est la seule source de
 * vérité sur la lecture. Le garde-fou porte sur ce qui ENTRE dans le cerveau —
 * les notes dérivées passent par `brain_proposals` et une validation admin.
 * `search_brain_trgm` n'est pas `security definer`, la RLS s'applique donc bien
 * à l'appelant.
 */
export async function retrieveNotes(
  question: string,
  deps: { db: SupabaseClient },
): Promise<BrainNote[]> {
  const q = question.trim();
  if (!q) return [];
  const { db } = deps;

  const { data: seeds, error } = await db.rpc('search_brain_trgm', {
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
    const { data: linked } = await db
      .from('brain_notes')
      .select(COLS)
      .in('path', targetPaths);
    for (const r of (linked as Row[]) ?? []) {
      if (!byPath.has(r.path)) byPath.set(r.path, r);
    }
  }

  // Exclut les notes marquées obsolètes (`frontmatter.stale`) — ex. une réponse
  // capitalisée dont la fiche/livrable source a changé (cf. anti-obsolescence P3).
  return [...byPath.values()]
    .filter((r) => r.frontmatter?.['stale'] !== true)
    .slice(0, MAX_NOTES)
    .map(toNote);
}
