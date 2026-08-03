# Le Cerveau — Phase 1 (fiches → cerveau → assistant) — Design / Spec

**Statut :** design validé (brainstorming) — à transformer en plan d'implémentation (writing-plans).

## Contexte & objectif

L'assistant process (SOLUVIAV2) répond aujourd'hui via un RAG **OpenAI** : embeddings `text-embedding-3-small` sur `process_index`, réponses `gpt-4o-mini`. Deux limites : (1) rien n'est capitalisé — chaque réponse repart du texte brut ; (2) c'est de l'OpenAI.

Le **Cerveau** est une **couche de connaissance persistante et invisible** : chaque source est **analysée une seule fois par Claude** et devient une **note Markdown reliée** (`[[wikilinks]]`) dans un **coffre Obsidian hébergé sur un dépôt GitHub**, mirrorée dans Postgres pour l'interrogation rapide. L'assistant répond ensuite à partir des notes pré-analysées — il ne relit plus les docs bruts.

**Contrainte dure : tout l'IA du cerveau utilise Claude (tokens Anthropic), jamais OpenAI. Aucun embedding** (Anthropic n'en fournit pas) → la recherche se fait par **mots-clés (`pg_trgm`) + graphe de liens + raisonnement Claude**.

**Périmètre Phase 1 (cette spec) :** boucle complète de bout en bout sur **une seule source : les fiches process**. Ingestion fiche → note Claude → coffre GitHub + miroir Postgres ; recherche notes ; bascule de l'assistant sur Claude + cerveau. Les livrables Drive (Phase 2) et la capitalisation des conversations/feedback (Phase 3) sont **hors périmètre** ici, mais le schéma et le format de note les anticipent.

## Architecture (Phase 1)

```
fiches finalisées (Soluvia-Process, déjà tirées par fetchFinalizedFiches)
        │  cron /api/cron/brain-sync   (incrémental via source_hash)
        ▼
   Claude (analyse)  ── @ai-sdk/anthropic, claude-haiku-4-5 ──►  note structurée
        │
        ├── écrit le .md dans le coffre GitHub  (contents API, 1 commit/note)
        └── upsert dans Postgres `brain_notes`  (miroir runtime)
                                   │
   question ──► retrieveNotes(q)   │  pg_trgm sur brain_notes  +  expansion [[liens]] (1 saut)
        │                         ▼
        └──► Claude (réponse) ── claude-sonnet-5 ── streaming ──► assistant (citations note→fiche)
```

Le miroir Postgres est la **vérité runtime** (rapide, pas de dépendance GitHub à chaud). GitHub est la **vérité humaine/Obsidian** (versionnée, auditable). Un échec GitHub ne casse pas les réponses.

## Modèle de données

Migration `supabase/migrations/20260803140000_brain_notes.sql` (DB `soluvia-prod`, appliquée via `npm run db:migrate`) :

```sql
create table if not exists public.brain_notes (
  id           uuid primary key default gen_random_uuid(),
  path         text unique not null,              -- 'fiches/lancement-a1.md'
  type         text not null check (type in ('fiche','livrable','conversation','entite')),
  title        text not null,
  aliases      text[] not null default '{}',
  tags         text[] not null default '{}',
  links        text[] not null default '{}',      -- cibles sortantes, paths SANS extension (ex. 'entites/opco'), pour jointure au graphe
  body         text not null,                      -- markdown analysé (le corps de la note)
  frontmatter  jsonb not null default '{}',
  source_ref   text,                               -- fiche_id (Phase 2 : fileId ; Phase 3 : conv id)
  source_hash  text,                               -- pour sauter l'analyse si inchangé
  updated_at   timestamptz not null default now()
);

create index if not exists brain_notes_type_idx on public.brain_notes (type);
create index if not exists brain_notes_source_ref_idx on public.brain_notes (source_ref);
create extension if not exists pg_trgm;
create index if not exists brain_notes_title_trgm on public.brain_notes using gin (title gin_trgm_ops);
create index if not exists brain_notes_body_trgm  on public.brain_notes using gin (body  gin_trgm_ops);

alter table public.brain_notes enable row level security;
-- Lecture réservée admin (contenu interne). Les écritures passent par le
-- service role (bypass RLS) via le cron ; aucune policy write pour authenticated.
create policy "brain lisible par admin"
  on public.brain_notes for select to authenticated
  using ((select public.is_admin()));

-- Recherche trgm : top notes par similarité titre+corps sur la requête.
create or replace function public.search_brain_trgm(q text, k int default 6)
returns setof public.brain_notes
language sql stable
as $$
  select *
  from public.brain_notes
  where q <> '' and (title ilike '%'||q||'%' or body ilike '%'||q||'%'
        or similarity(title, q) > 0.1 or similarity(body, q) > 0.05)
  order by greatest(similarity(title, q), similarity(body, q)) desc
  limit greatest(k, 1);
$$;
```

(`is_admin()` existe déjà dans `soluvia-prod`, cf. `process_qa_feedback`.)

## Format de note (Obsidian)

Une note = frontmatter YAML + corps Markdown + `[[wikilinks]]`. Exemple fiche :

```markdown
---
id: fiche-a1
type: fiche
source_ref: A.1
tags: [lancement, cadrage]
aliases: ['Cadrage de la création', 'M0-M1']
links: ['[[entites/opco]]', '[[livrables/1iC0qW...]]']
updated: 2026-08-03
---

# Cadrage de la création (M0–M1)

**Résumé.** …2-4 phrases…

## Points clés

- …

## Entités

- [[entites/opco]] · [[entites/ticket-a-001]]

## Sources

- Fiche process [[../fiches/lancement-a1]] · A.1
```

Le corps est **produit par Claude** (résumé, points clés, entités) ; les `links` sont dérivés des entités détectées et des livrables de la fiche (liens « forward » tolérés par Obsidian même si la cible n'existe pas encore — Phase 2 les remplira).

## Structure de fichiers (nouveau code)

- `lib/brain/types.ts` — `BrainNote`, `NoteAnalysis`, `NoteFrontmatter`.
- `lib/brain/claude.ts` — provider Anthropic (`createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })`) + `analyzeFiche(fiche): Promise<NoteAnalysis>` (via `generateObject` + schéma zod). Lève si `ANTHROPIC_API_KEY` absent.
- `lib/brain/note.ts` — **pur, testé** : `slugify`, `notePath(type, key)`, `buildMarkdown(note)`, `parseFrontmatter(md)`, `wikilink(path)`.
- `lib/brain/github.ts` — `putNote(path, markdown, message)` via GitHub contents API (GET sha → PUT base64). No-op + log si `BRAIN_GITHUB_*` absent.
- `lib/brain/sync.ts` — `syncBrainFiches(deps)` : incrémental par `source_hash` (calqué sur `syncProcessIndex`), pour chaque fiche changée → `analyzeFiche` → `buildMarkdown` → `putNote` (GitHub) + upsert `brain_notes` (Postgres). DI-friendly (fakes en test).
- `lib/brain/retrieve.ts` — `retrieveNotes(question, { admin }): Promise<BrainNote[]>` : `search_brain_trgm` (graines) → expansion `links` (1 saut) → set unique plafonné (~8).
- `app/api/cron/brain-sync/route.ts` — cron (auth `verifyCronAuth`, `maxDuration = 300`), appelle `syncBrainFiches` avec `fetchFinalizedFiches` + `createAdminClient`. Ajout au `crons` de `vercel.json`.

## Code modifié

- `lib/env.ts` — ajouter (toutes optionnelles ; features off si absentes) :
  - `ANTHROPIC_API_KEY` — sans elle : ingestion cerveau + réponses Claude désactivées (fallback assistant actuel).
  - `BRAIN_GITHUB_REPO` (`owner/repo`), `BRAIN_GITHUB_TOKEN` (PAT fine-grained, droit _contents:write_), `BRAIN_GITHUB_BRANCH` (défaut `main`).
- `app/api/process/ask/route.ts` — quand `ANTHROPIC_API_KEY` présent : retrieval via `retrieveNotes` (au lieu de `retrieveContext`/embeddings) + génération via Claude (`claude-sonnet-5`) au lieu de `gpt-4o-mini`. Le contrat `{ messages }`, le header `x-process-sources` et le streaming **restent identiques** (aucun changement UI). Sources = les notes utilisées, mappées vers l'URL de la fiche (`/process/fiches/<source_ref>`). Fallback OpenAI conservé si `ANTHROPIC_API_KEY` absent.

`process_index` et le cron `process-sync` (embeddings OpenAI) **restent en place** mais ne sont plus lus par l'assistant quand le cerveau est actif — dépose zéro régression, retrait éventuel en Phase 3.

## Schéma d'analyse Claude (generateObject)

```ts
const NoteAnalysis = z.object({
  title: z.string().max(120),
  summary: z.string().max(600), // 2-4 phrases, français
  key_points: z.array(z.string()).max(12),
  entities: z.array(z.string()).max(15), // OPCO, codes ticket, missions, outils…
  aliases: z.array(z.string()).max(6),
  tags: z.array(z.string()).max(8),
});
```

Modèles : **ingestion** `claude-haiku-4-5` (volume, coût) ; **réponses assistant** `claude-sonnet-5` (qualité conversationnelle). IDs exacts à confirmer côté `@ai-sdk/anthropic` au moment de l'implémentation.

## Recherche à la question (sans embedding)

1. `search_brain_trgm(question, 6)` → notes-graines.
2. Union des `links` des graines (paths sans extension) → chargement des notes cibles présentes : `where regexp_replace(path, '\.md$', '') = any(:links)` (1 saut de graphe).
3. Ensemble unique, plafonné à ~8 notes, passé en contexte ancré à Claude (réutilise le style de `buildChatMessages`).
4. Réponse streamée avec citations `[n]` → note → fiche (le composant `citation-text` existant fonctionne tel quel).

## Gestion d'erreurs

- Source injoignable (`fetchFinalizedFiches` throw) → **aucun delete**, l'index cerveau existant est conservé (comme `syncProcessIndex`).
- `analyzeFiche` échoue sur une fiche → on **saute** cette fiche (garde la note précédente), log, on continue les autres.
- `putNote` GitHub échoue → log + on **continue** (Postgres = vérité runtime ; réconciliation au prochain run).
- `ANTHROPIC_API_KEY` absent → cron répond `{ ok:false, error:'ai_not_configured' }` (503) ; assistant retombe sur le RAG OpenAI existant.
- Le cron ne vide jamais brutalement la table.

## Tests

- **Purs** (`__tests__/brain-note.test.ts`) : `slugify`, `notePath`, `buildMarkdown` (frontmatter + wikilinks corrects), `parseFrontmatter` (round-trip).
- **Sync** (`__tests__/brain-sync.test.ts`) : avec fakes injectés — (a) fiche inchangée (`source_hash` identique) → **0 appel Claude, 0 écriture** (le cœur du « ne pas réanalyser ») ; (b) fiche nouvelle/modifiée → 1 analyse + 1 putNote + 1 upsert ; (c) `analyzeFiche` qui throw → la fiche est sautée, les autres passent.
- **Retrieval** (`__tests__/brain-retrieve.test.ts`) : graines + expansion de liens → ensemble attendu, dédupliqué, plafonné.

Commande : `npx vitest run __tests__/brain-*.test.ts && npx tsc --noEmit && npm run lint && npm run build`.

## Dépendances externes (à fournir)

1. **`ANTHROPIC_API_KEY`** (Vercel env) — facturation Claude directe.
2. **Un dépôt GitHub** pour le coffre + **`BRAIN_GITHUB_TOKEN`** (PAT fine-grained, _contents:write_ sur ce repo), `BRAIN_GITHUB_REPO`, `BRAIN_GITHUB_BRANCH`.
3. Paquet `@ai-sdk/anthropic` (à ajouter aux dépendances).

## Hors périmètre (phases suivantes)

- **Phase 2** : ingestion du **contenu des livrables Drive** (fetch Drive existant + extraction texte PDF/HTML/docx + `analyzeLivrable` Claude → notes `livrables/*`, qui résolvent les liens forward des fiches).
- **Phase 3** : **capitalisation des conversations + feedback** (note `conversations/*` sur 👍, 👎 = « à revoir ») et **notes-entités** (`entites/*`) générées comme carrefours du graphe ; retrait éventuel du RAG OpenAI.

## Risques / vigilance

- **Qualité de recherche sans vecteurs** : `pg_trgm` est lexical. Atténué par de bons `title`/`aliases`/`entities` (Claude) + l'expansion de graphe. Si insuffisant en Phase 2-3, option repli : embeddings **Voyage** (non-OpenAI) ajoutés au miroir — sans changer le reste.
- **Écritures GitHub concurrentes** : 1 note par commit ; en cas de course sur la même note, gérer le `sha` (retry sur 409). Volume faible en Phase 1 (peu de fiches).
- **Idempotence** : `source_hash` doit être stable (réutiliser le `content_hash` de la fiche déjà fourni par la source).
- **Coût** : ingestion seulement sur fiches changées ; Haiku pour l'analyse. Négligeable au volume actuel.

```

```
