import type { SupabaseClient } from '@supabase/supabase-js';
import { cosineSimilarity, embedText } from './embeddings';
import { buildSnippet } from './snippet';
import type { ProcessSearchResult } from './types';

interface IndexRow {
  source_fiche_id: string;
  mission_nom: string;
  titre: string;
  contenu: string;
  url: string;
  embedding: number[];
}

const TOP_N = 10;

/** Classe des lignes d'index par cosinus décroissant vs le vecteur requête. */
export function rankResults(
  rows: IndexRow[],
  queryVec: number[],
  query: string,
  topN = TOP_N,
): ProcessSearchResult[] {
  return rows
    .map((r) => ({ r, score: cosineSimilarity(queryVec, r.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ r, score }) => ({
      source_fiche_id: r.source_fiche_id,
      titre: r.titre,
      mission: r.mission_nom,
      url: r.url,
      snippet: buildSnippet(r.contenu, query),
      score,
    }));
}

function rowToResult(r: IndexRow, query: string): ProcessSearchResult {
  return {
    source_fiche_id: r.source_fiche_id,
    titre: r.titre,
    mission: r.mission_nom,
    url: r.url,
    snippet: buildSnippet(r.contenu, query),
    score: 0,
  };
}

export interface SearchDeps {
  admin: SupabaseClient;
  embedQuery?: (q: string) => Promise<number[]>;
}

/**
 * Recherche sémantique des process finalisés.
 * Embed la requête → classe par cosinus. Si l'embedding échoue (OpenAI down),
 * bascule sur le fallback mots-clés pg_trgm (`search_process_trgm`).
 */
export async function searchProcess(
  query: string,
  deps: SearchDeps,
): Promise<ProcessSearchResult[]> {
  const { admin } = deps;
  const embedQuery = deps.embedQuery ?? embedText;
  const q = query.trim();
  if (!q) return [];

  let queryVec: number[];
  try {
    queryVec = await embedQuery(q);
  } catch (e) {
    console.error(
      '[process/search] embedding requête échoué, fallback trgm:',
      e,
    );
    const { data, error } = await admin.rpc('search_process_trgm', { q });
    if (error) {
      console.error('[process/search] fallback trgm échoué:', error.message);
      return [];
    }
    return (data as IndexRow[]).map((r) => rowToResult(r, q));
  }

  const { data, error } = await admin
    .from('process_index')
    .select('source_fiche_id, mission_nom, titre, contenu, url, embedding');
  if (error) {
    console.error('[process/search] lecture index échouée:', error.message);
    return [];
  }
  return rankResults((data as IndexRow[]) ?? [], queryVec, q);
}
