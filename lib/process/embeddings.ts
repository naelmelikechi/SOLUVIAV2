import { embed, embedMany as aiEmbedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims

function model() {
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  // NB : sur @ai-sdk/openai v3, `.embedding(...)` et `.textEmbeddingModel(...)`
  // type-checkent tous les deux, mais `.textEmbeddingModel` est marqué
  // @deprecated (au profit de `.embedding` / `.embeddingModel`). On utilise
  // donc `.embedding(...)`.
  return openai.embedding(EMBEDDING_MODEL);
}

/** Embedding d'un texte unique (ex. la requête de recherche). */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: model(), value: text });
  return embedding;
}

/** Embeddings d'un lot de textes (ex. les fiches à (re)vectoriser). */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await aiEmbedMany({ model: model(), values: texts });
  return embeddings;
}

/** Similarité cosinus. Renvoie 0 si l'un des vecteurs est nul. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
