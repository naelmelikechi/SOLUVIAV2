import type { SupabaseClient } from '@supabase/supabase-js';
import { cosineSimilarity, embedText } from './embeddings';

export interface RagFiche {
  source_fiche_id: string;
  titre: string;
  mission: string;
  url: string;
  contenu: string;
}

const TOP_K = 4;

interface Row {
  source_fiche_id: string;
  mission_nom: string;
  titre: string;
  contenu: string;
  embedding: number[];
}

function toFiche(r: {
  source_fiche_id: string;
  mission_nom: string;
  titre: string;
  contenu: string;
}): RagFiche {
  return {
    source_fiche_id: r.source_fiche_id,
    titre: r.titre,
    mission: r.mission_nom,
    url: `/process/fiches/${r.source_fiche_id}`,
    contenu: r.contenu,
  };
}

export interface RetrieveDeps {
  admin: SupabaseClient;
  embedQuery?: (q: string) => Promise<number[]>;
}

/** Top-K fiches pertinentes (cosinus ; fallback trgm si l'embedding échoue). */
export async function retrieveContext(
  question: string,
  deps: RetrieveDeps,
): Promise<RagFiche[]> {
  const { admin } = deps;
  const embedQuery = deps.embedQuery ?? embedText;
  const q = question.trim();
  if (!q) return [];

  let queryVec: number[];
  try {
    queryVec = await embedQuery(q);
  } catch (e) {
    console.error('[process/rag] embedding échoué, fallback trgm:', e);
    const { data, error } = await admin.rpc('search_process_trgm', { q });
    if (error) console.error('[process/rag] fallback trgm:', error.message);
    return ((data as Row[]) ?? []).slice(0, TOP_K).map(toFiche);
  }

  const { data, error } = await admin
    .from('process_index')
    .select('source_fiche_id, mission_nom, titre, contenu, embedding');
  if (error) {
    console.error('[process/rag] lecture index:', error.message);
    return [];
  }

  return ((data as Row[]) ?? [])
    .map((r) => ({ r, score: cosineSimilarity(queryVec, r.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(({ r }) => toFiche(r));
}

const SYSTEM_PROMPT = `Tu es l'assistant des process internes de Soluvia (organisme de formation).
Réponds à la question du collaborateur en te basant UNIQUEMENT sur les extraits de process fournis.
- Sois concret et actionnable ; structure la réponse (étapes numérotées, points clés).
- Cite les fiches par leur titre quand c'est utile.
- Si l'information n'est pas dans les process fournis, dis-le clairement (« Je ne trouve pas cette information dans les process finalisés ») et n'invente rien.
- Réponds en français, en markdown concis.`;

/** Construit les messages (system d'ancrage + prompt avec contexte + question). Pur. */
export function buildRagMessages(
  question: string,
  fiches: RagFiche[],
): { system: string; prompt: string } {
  const contexte = fiches.length
    ? fiches
        .map(
          (f, i) =>
            `### Process ${i + 1} — ${f.mission} · ${f.titre}\n${f.contenu}`,
        )
        .join('\n\n')
    : '(aucun process finalisé disponible)';
  const prompt = `Process finalisés disponibles :\n\n${contexte}\n\n---\nQuestion du collaborateur : ${question}`;
  return { system: SYSTEM_PROMPT, prompt };
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_CHAT = `Tu es l'assistant des process internes de Soluvia (organisme de formation).
Réponds à la conversation en te basant UNIQUEMENT sur les process fournis (numérotés [1], [2], …).
- Cite tes affirmations avec le numéro du process source, ex. « … selon la fiche [1] ».
- Sois concret et actionnable ; structure (étapes, points clés) en markdown concis, en français.
- Si l'information n'est pas dans les process fournis, dis-le (« Je ne trouve pas cette information dans les process finalisés ») et n'invente rien.`;

/** Messages pour le chat RAG : system d'ancrage + contexte numéroté + historique. */
export function buildChatMessages(
  history: ChatMsg[],
  fiches: RagFiche[],
): { system: string; messages: ChatMsg[] } {
  const contexte = fiches.length
    ? fiches
        .map((f, i) => `[${i + 1}] ${f.mission} · ${f.titre}\n${f.contenu}`)
        .join('\n\n')
    : '(aucun process finalisé disponible)';
  // Le contexte est injecté comme message `user` de tête (le `system` reste
  // le grounding). Deux messages `user` consécutifs (ce préambule + le 1er
  // tour de l'historique) est intentionnel et accepté par l'API.
  const preface: ChatMsg = {
    role: 'user',
    content: `Process finalisés disponibles (source des réponses) :\n\n${contexte}\n\n---\nUtilise ces process pour répondre à la conversation ci-dessous.`,
  };
  return { system: SYSTEM_CHAT, messages: [preface, ...history] };
}

/** Dernier message utilisateur d'un historique (pour le retrieval). */
export function lastUserQuestion(history: ChatMsg[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === 'user') return m.content;
  }
  return '';
}
