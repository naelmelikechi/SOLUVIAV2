# Assistant IA process — V2 (conversationnel, citations, suggestions, feedback) — Plan

**Goal:** Transformer l'assistant one-shot en **assistant conversationnel complet** : fil multi-tours (mémoire), **citations inline** [n] cliquables, **questions suggérées** (démarrage + relances), **Stop/Régénérer**, **feedback 👍/👎** persisté. gpt-4o-mini, streaming, ancré sur les process.

**Repo:** `~/Desktop/SOLUVIAV2`, branche `feat/process-assistant-v2`. `ai` v6 + `@ai-sdk/openai` v3. Réutilise `lib/process/rag.ts` (`retrieveContext`, `RagFiche`), `embeddings`, `process_index`. Tests plats. `noUncheckedIndexedAccess`. Migration prod via `npm run db:migrate`.

**Existant à faire évoluer :** `app/api/process/ask/route.ts`, `components/process/process-hub.tsx`, `components/process/process-answer.tsx`, `lib/process/rag.ts`.

---

## Task V1 — Backend conversationnel + citations + relances

**Files:** Modify `lib/process/rag.ts`, `app/api/process/ask/route.ts` ; Create `app/api/process/followups/route.ts` ; Test `__tests__/process-rag.test.ts` (extend).

- [ ] **Step 1 — `lib/process/rag.ts` : `buildChatMessages` (pur, testé)**. Ajouter :

```ts
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
```

Tests (ajouter à `__tests__/process-rag.test.ts`) : `buildChatMessages` inclut le contexte numéroté `[1]` + l'historique ; `lastUserQuestion` renvoie le dernier message user. Garder les tests `buildRagMessages` existants (la fonction reste, non supprimée). Run vitest → PASS.

- [ ] **Step 2 — route `app/api/process/ask/route.ts` (chat)** : accepter `{ messages: ChatMsg[] }` (au lieu de `{question}`). Auth 401 ; si `messages` vide/invalid → 400 ; `!OPENAI_API_KEY` → 503. `const question = lastUserQuestion(messages); if (question.length > 2000) → 400`. `retrieveContext(question, {admin: supabase})`. `const { system, messages: modelMsgs } = buildChatMessages(messages, fiches);` `streamText({ model: openai('gpt-4o-mini'), system, messages: modelMsgs, temperature: 0.2 })`. Retour `result.toTextStreamResponse({ headers: { 'x-process-sources': encodeURIComponent(JSON.stringify(sources)) } })`. (Rétro-compat facultative : accepter aussi `{question}` en le convertissant en `[{role:'user',content:question}]`.)

- [ ] **Step 3 — route `app/api/process/followups/route.ts`** : POST `{ question, answer }` → 3 questions de relance courtes. Auth 401. `generateObject({ model: openai('gpt-4o-mini'), schema: z.object({ suggestions: z.array(z.string()).max(3) }), prompt: 'À partir de cette Q/R sur les process internes Soluvia, propose 3 questions de relance courtes et utiles (max ~8 mots), en français, sans redite. Q: ... R: ...' })`. Renvoie `{ suggestions }`. Si `!OPENAI_API_KEY` → `{ suggestions: [] }`.

- [ ] **Step 4 — vérif** `npx vitest run __tests__/process-rag.test.ts && npx tsc --noEmit && npm run lint && npm run build`. Routes `/api/process/ask` + `/api/process/followups` présentes. Commit : `feat(process): assistant conversationnel (chat + citations + relances)`.

---

## Task V2 — Feedback persisté

**Files:** Create `supabase/migrations/20260803120000_process_qa_feedback.sql` ; Create `app/api/process/feedback/route.ts` ; regen `types/database.ts`.

- [ ] **Step 1 — migration** :

```sql
create table if not exists public.process_qa_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question text not null,
  answer text not null,
  rating smallint not null check (rating in (-1, 1)),
  sources jsonb,
  created_at timestamptz not null default now()
);
alter table public.process_qa_feedback enable row level security;
create policy "feedback insert par l'auteur"
  on public.process_qa_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "feedback lisible par admin"
  on public.process_qa_feedback for select to authenticated
  using ((select public.is_admin()));
```

(Vérifier que `is_admin()` existe dans ce schéma ; sinon policy select réservée `using (false)` ou à un rôle existant.) Appliquer local (`npx supabase db push`) + `npm run db:migrate:dry`. Regen types.

- [ ] **Step 2 — route `app/api/process/feedback/route.ts`** : POST `{ question, answer, rating, sources }` (rating ∈ {-1,1}). Auth → `user_id = user.id`. Insert via client user-scoped. Valide rating ∈ {-1,1} (400 sinon). Renvoie `{ ok: true }`.

- [ ] **Step 3 — vérif** tsc/lint/build. Commit : `feat(process): table + endpoint feedback assistant`.

---

## Task V3 — UI chat complète

**Files:** Rewrite the answer/results part of `components/process/process-hub.tsx` ; Create `components/process/process-chat.tsx`, `components/process/process-answer.tsx` (adapter/remplacer), `components/process/citation-text.tsx`.

Transforme le mode « réponse » en **fil de discussion** :

- **État** : `messages: Array<{role, content}>`, `sources`, `asking`, `error`, un `AbortController` ref, `followups: string[]`.
- **Démarrage** : depuis la searchbar du héro (1re question) → passe en mode chat. Le hero/browse reste visible tant qu'aucune conversation.
- **Composer** en bas du fil pour poser des questions de suite. Envoi = append `{role:'user'}` + append un `{role:'assistant', content:''}` puis stream dedans.
- **Streaming** : `POST /api/process/ask` avec `{ messages }` (tout l'historique) ; lire le header sources ; lire le body en flux dans le dernier message assistant ; `AbortController` (bouton **Stop** pendant le stream ; ignore `AbortError`).
- **Régénérer** : re-poser la dernière question user (retire la dernière réponse assistant, relance).
- **Relances** : après la fin d'un stream, `POST /api/process/followups {question, answer}` → afficher les `suggestions` en chips cliquables (clic = pose la question).
- **Questions suggérées de démarrage** : chips au-dessus, dérivées des **process disponibles** (props `all`) — ex. pour chaque des 3 premiers process : `«{titre}» : par où commencer ?` (pur, pas d'appel IA). Garder aussi 1-2 exemples génériques.
- **Citations** : `components/citation-text.tsx` — un rendu qui, dans le markdown de l'assistant, remplace `[n]` par une **puce cliquable** (superscript `[n]`) reliée à `sources[n-1].url` (lien interne). Implémentation : composant `Citations` qui post-traite le texte (regex `\[(\d+)\]`) OU un `components={{ text }}` override de react-markdown. Fallback : si `n` hors bornes, laisser `[n]` en texte.
- **Feedback** : sous chaque réponse assistant terminée, boutons 👍/👎 → `POST /api/process/feedback {question, answer, rating, sources}` ; état visuel « merci ».
- **Effacer / Nouvelle conversation** : reset complet (messages/sources/followups/error), abort en cours.
- Style : bulles utilisateur (alignées, `bg-muted`) et carte assistant (Sparkles, `bg-card`), cohérent hub. a11y : `aria-live="polite"` sur la dernière réponse, boutons `type=button`, focus visibles, composer `type=submit`.

- [ ] tsc/lint/build OK ; suite verte. Commit : `feat(process): UI assistant conversationnel (fil, citations, relances, feedback)`.

---

## Task V4 — Déploiement + e2e

- [ ] Migration prod (`npm run db:migrate`) pour `process_qa_feedback`.
- [ ] PR → CI → merge → deploy.
- [ ] Vérifier `/process` : conversation multi-tours, réponse streamée avec citations [n] cliquables, relances, stop/régénérer, 👍/👎.

## Vigilance

- (1) `streamText({messages})` : format `ChatMsg` (role/content) accepté par `ai` v6 — sinon mapper vers `CoreMessage`. (2) Le préambule contexte est un message `user` en tête (le system reste le grounding). (3) Citations : borner `n` aux sources réelles. (4) Follow-ups/feedback ne doivent jamais bloquer le fil (best-effort, erreurs silencieuses côté UI). (5) Retrieval sur le **dernier** message user.
