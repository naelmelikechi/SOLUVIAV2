# Assistant IA sur les process (RAG) — Plan

**Goal:** Transformer la recherche en assistant : question → réponse IA **ancrée** (streamée, gpt-4o-mini) + **fiches sources** cliquables.

**Architecture:** Retrieval via les embeddings existants (top-4 fiches de `process_index`, cosinus, fallback trgm) → `streamText` OpenAI avec un system prompt d'ancrage → route qui streame la réponse (corps) et renvoie les sources (header `x-process-sources`). UI dans le hub : carte « Réponse » qui s'écrit en direct + section « Sources ». Aucune évolution DB.

**Repo:** `~/Desktop/SOLUVIAV2`, branche `feat/process-rag-assistant`. `ai` v6 + `@ai-sdk/openai` v3 (modèle via `createOpenAI({apiKey: env.OPENAI_API_KEY})('gpt-4o-mini')`, cf. `lib/ai/bug-triage.ts`). Réutilise `lib/process/embeddings.ts` (`embedText`, `cosineSimilarity`), `process_index` (colonnes `source_fiche_id, mission_nom, titre, contenu, embedding`), RPC `search_process_trgm`. Tests plats `__tests__/*.test.ts`. `noUncheckedIndexedAccess`.

---

## Task R1 — Backend RAG (lib + route)

**Files:** Create `lib/process/rag.ts`, `app/api/process/ask/route.ts` ; Test `__tests__/process-rag.test.ts`.

- [ ] **Step 1 — test `buildRagMessages` (rouge)** `__tests__/process-rag.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { buildRagMessages } from '@/lib/process/rag';

describe('buildRagMessages', () => {
  const fiches = [
    {
      source_fiche_id: '1',
      titre: 'Facturation OPCO',
      mission: 'Facturation',
      url: '/process/fiches/1',
      contenu: 'Étapes de facturation OPCO...',
    },
  ];
  it('ancre le system prompt et inclut contexte + question', () => {
    const { system, prompt } = buildRagMessages(
      'comment facturer un OPCO ?',
      fiches as never,
    );
    expect(system.toLowerCase()).toContain('uniquement'); // ancrage
    expect(prompt).toContain('Facturation OPCO'); // contexte
    expect(prompt).toContain('Étapes de facturation OPCO'); // contenu
    expect(prompt).toContain('comment facturer un OPCO ?'); // question
  });
  it('gère un contexte vide', () => {
    const { prompt } = buildRagMessages('x', []);
    expect(prompt).toContain('x');
  });
});
```

Run `npx vitest run __tests__/process-rag.test.ts` → FAIL.

- [ ] **Step 2 — `lib/process/rag.ts`** :

```ts
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
    const { data } = await admin.rpc('search_process_trgm', { q });
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
```

Run test → PASS.

- [ ] **Step 3 — route `app/api/process/ask/route.ts`** :

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { retrieveContext, buildRagMessages } from '@/lib/process/rag';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { question } = (await req.json().catch(() => ({}))) as {
    question?: string;
  };
  const q = (question ?? '').trim();
  if (!q)
    return NextResponse.json({ error: 'empty_question' }, { status: 400 });
  if (!env.OPENAI_API_KEY)
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

  const fiches = await retrieveContext(q, { admin: createAdminClient() });
  const sources = fiches.map((f) => ({
    source_fiche_id: f.source_fiche_id,
    titre: f.titre,
    mission: f.mission,
    url: f.url,
  }));

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const { system, prompt } = buildRagMessages(q, fiches);
  const result = streamText({
    model: openai('gpt-4o-mini'),
    system,
    prompt,
    temperature: 0.2,
  });

  // Réponse en flux (corps) + sources (header, encodé pour supporter les accents).
  return result.toTextStreamResponse({
    headers: {
      'x-process-sources': encodeURIComponent(JSON.stringify(sources)),
    },
  });
}
```

- [ ] **Step 4 — vérif** `npx vitest run __tests__/process-rag.test.ts && npx tsc --noEmit && npm run lint && npm run build`. Vérifier route `/api/process/ask` présente. (NB : selon la version d'`ai`, si `toTextStreamResponse` n'existe pas, utiliser `result.toUIMessageStreamResponse()` ou `new Response(result.textStream, {...})` — choisir ce qui compile.) Commit : `feat(process): backend assistant RAG (retrieval + route streaming)`.

---

## Task R2 — UI streaming dans le hub

**Files:** Modify `components/process/process-hub.tsx` (+ éventuel petit composant `process-answer.tsx`).

Réutilise `Highlight` non nécessaire ici. Rendu markdown via `ProcessMarkdown` (`@/components/process/process-markdown`). Rendu des sources via le composant ligne existant (`ProcessRow` dans le hub) — lien interne `url`.

- [ ] **Step 1 — état & soumission** : dans `ProcessHub`, quand une question est soumise, au lieu d'appeler `searchProcessAction`, appeler un handler `ask(q)` qui :
  - passe en mode « answer » (masque browse), state `answer=''`, `sources=[]`, `asking=true` ;
  - `const res = await fetch('/api/process/ask', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ question: q }) });`
  - `const h = res.headers.get('x-process-sources'); setSources(h ? JSON.parse(decodeURIComponent(h)) : []);`
  - si `!res.ok || !res.body` → afficher un message d'erreur + garder les sources ; `asking=false` ;
  - sinon lire le flux : `const reader = res.body.getReader(); const dec = new TextDecoder(); let acc=''; while(true){ const {done,value}=await reader.read(); if(done) break; acc += dec.decode(value, {stream:true}); setAnswer(acc); }` puis `asking=false`.
  - Garder les chips d'exemples : au clic → `ask(chipText)`.

- [ ] **Step 2 — rendu** (remplace la section « Résultats » actuelle par « Réponse + Sources ») :
  - **Carte Réponse** : en-tête « Réponse » (petit icône `Sparkles` lucide) ; corps = `<ProcessMarkdown>{answer}</ProcessMarkdown>` ; si `asking && !answer` → skeleton/loader « L'assistant lit les process… » ; si `asking && answer` → curseur/indicateur discret « … ».
  - **Sources** : titre « Sources », liste des `sources` en lignes cliquables (`<Link href={s.url}>` : mission + titre + flèche), style cohérent avec les lignes du hub. Si `sources.length===0` → « Aucun process finalisé à citer. »
  - Bouton **« Effacer »** → repasse en mode browse (reset answer/sources/query).
  - Accessibilité : bouton submit `type=submit`, focus visibles, `aria-live="polite"` sur la carte réponse pour l'annonce du streaming.

- [ ] **Step 3 — vérif** `npx tsc --noEmit && npm run lint && npm run build`. Commit : `feat(process): assistant IA dans le hub (réponse streamée + sources)`.

---

## Task R3 — Déploiement + e2e

- [ ] PR → CI → merge → deploy.
- [ ] Vérifier `/process` : poser une question → la réponse s'écrit en direct, ancrée sur le(s) process, avec les sources cliquables.

## Auto-revue

| Élément                                  | Task |
| ---------------------------------------- | ---- |
| Retrieval top-K + fallback trgm          | R1   |
| System prompt d'ancrage + contexte       | R1   |
| Route streaming + sources header         | R1   |
| Réponse streamée (markdown) + sources UI | R2   |
| Déploiement + e2e                        | R3   |

**Vigilance :** (1) API `toTextStreamResponse` vs `toUIMessageStreamResponse` selon `ai` v6 — prendre ce qui compile ; le corps doit être **du texte brut** pour la lecture manuelle côté client. (2) Le header sources est `encodeURIComponent` (accents). (3) Réponse ancrée : ne jamais inventer hors process.
