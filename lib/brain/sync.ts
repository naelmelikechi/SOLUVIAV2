import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinalizedFiche } from '@/lib/process/types';
import type { NoteAnalysis } from './types';
import { ficheToBrainNote, buildMarkdown } from './note';

export interface BrainSyncDeps {
  fetchSource: () => Promise<FinalizedFiche[]>;
  analyze: (fiche: FinalizedFiche) => Promise<NoteAnalysis>;
  putNote: (
    path: string,
    markdown: string,
    message: string,
  ) => Promise<unknown>;
  admin: SupabaseClient;
}

export interface BrainSyncResult {
  analyzed: number;
  skipped: number;
  failed: number;
}

/**
 * Ingestion incrémentale des fiches dans le cerveau. Une fiche au
 * `content_hash` inchangé n'est PAS réanalysée. Une analyse qui échoue est
 * sautée (les autres passent). `fetchSource` qui throw remonte sans rien casser.
 */
export async function syncBrainFiches(
  deps: BrainSyncDeps,
): Promise<BrainSyncResult> {
  const { fetchSource, analyze, putNote, admin } = deps;
  const source = await fetchSource();

  const { data: existing, error } = await admin
    .from('brain_notes')
    .select('source_ref, source_hash')
    .eq('type', 'fiche');
  if (error) throw new Error(`select brain_notes: ${error.message}`);
  const seen = new Map(
    (
      (existing as Array<{ source_ref: string; source_hash: string }>) ?? []
    ).map((r) => [r.source_ref, r.source_hash]),
  );

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (const fiche of source) {
    if (seen.get(fiche.fiche_id) === fiche.content_hash) {
      skipped++;
      continue;
    }
    try {
      const analysis = await analyze(fiche);
      const note = ficheToBrainNote(fiche, analysis);
      await putNote(
        note.path,
        buildMarkdown(note),
        `brain: fiche ${fiche.fiche_code}`,
      );
      const { error: upErr } = await admin.from('brain_notes').upsert(
        {
          path: note.path,
          type: note.type,
          title: note.title,
          aliases: note.aliases,
          tags: note.tags,
          links: note.links,
          body: note.body,
          frontmatter: note.frontmatter,
          source_ref: note.source_ref,
          source_hash: note.source_hash,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'path' },
      );
      if (upErr) throw new Error(upErr.message);
      analyzed++;
    } catch (e) {
      failed++;
      console.error(
        '[brain/sync] fiche',
        fiche.fiche_id,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return { analyzed, skipped, failed };
}
