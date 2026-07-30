import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinalizedFiche } from './types';

export interface SyncDeps {
  fetchSource: () => Promise<FinalizedFiche[]>;
  embedMany: (texts: string[]) => Promise<number[][]>;
  admin: SupabaseClient;
  sourceBaseUrl: string;
}

export interface SyncResult {
  upserted: number;
  deleted: number;
}

/**
 * Synchronise `process_index` avec la source :
 *  - (re)vectorise et upsert les fiches nouvelles ou au hash modifié,
 *  - supprime les fiches disparues de la source,
 *  - si `fetchSource` échoue, l'erreur remonte AVANT tout delete (pas de wipe).
 */
export async function syncProcessIndex(deps: SyncDeps): Promise<SyncResult> {
  const { fetchSource, embedMany, admin, sourceBaseUrl } = deps;

  const source = await fetchSource(); // peut throw → aucun delete effectué

  const { data: existing, error: selErr } = await admin
    .from('process_index')
    .select('source_fiche_id, content_hash');
  if (selErr) throw new Error(`select process_index: ${selErr.message}`);

  const existingHash = new Map(
    (existing ?? []).map((r) => [r.source_fiche_id, r.content_hash]),
  );
  const sourceIds = new Set(source.map((f) => f.fiche_id));
  const base = sourceBaseUrl.replace(/\/$/, '');

  const changed = source.filter(
    (f) => existingHash.get(f.fiche_id) !== f.content_hash,
  );
  let upserted = 0;
  if (changed.length) {
    const vectors = await embedMany(changed.map((f) => f.contenu));
    if (vectors.length !== changed.length) {
      throw new Error(
        `embedMany a renvoyé ${vectors.length} vecteurs pour ${changed.length} fiches`,
      );
    }
    const rows = changed.map((f, i) => {
      const embedding = vectors[i];
      if (!embedding || embedding.length === 0) {
        throw new Error(`embedding manquant/vide pour la fiche ${f.fiche_id}`);
      }
      return {
        source_fiche_id: f.fiche_id,
        mission_code: f.mission_code,
        mission_nom: f.mission_nom,
        fiche_code: f.fiche_code,
        titre: f.titre,
        contenu: f.contenu,
        url: `${base}/fiches/${f.fiche_id}`,
        content_hash: f.content_hash,
        embedding,
        updated_at: new Date().toISOString(),
      };
    });
    const { error: upErr } = await admin
      .from('process_index')
      .upsert(rows, { onConflict: 'source_fiche_id' });
    if (upErr) throw new Error(`upsert process_index: ${upErr.message}`);
    upserted = rows.length;
  }

  const toDelete = (existing ?? [])
    .map((r) => r.source_fiche_id)
    .filter((id) => !sourceIds.has(id));
  let deleted = 0;
  if (toDelete.length) {
    const { error: delErr } = await admin
      .from('process_index')
      .delete()
      .in('source_fiche_id', toDelete);
    if (delErr) throw new Error(`delete process_index: ${delErr.message}`);
    deleted = toDelete.length;
  }

  return { upserted, deleted };
}
