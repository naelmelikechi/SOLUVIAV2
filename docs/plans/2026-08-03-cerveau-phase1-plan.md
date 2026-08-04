# Le Cerveau — Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la couche « cerveau » sur les fiches process : ingestion Claude → coffre GitHub + miroir Postgres `brain_notes`, recherche sans embedding (pg_trgm + graphe), et bascule de l'assistant sur Claude + cerveau. Zéro OpenAI dans le chemin cerveau.

**Architecture :** Cron `brain-sync` analyse chaque fiche changée (hash) avec `claude-haiku-4-5`, écrit une note Markdown reliée dans le coffre GitHub et l'upsert dans `brain_notes`. À la question, `retrieveNotes` fait du `pg_trgm` + 1 saut de graphe, et l'assistant répond via `claude-sonnet-5`. Fallback OpenAI conservé si `ANTHROPIC_API_KEY` absent.

**Tech Stack :** Next.js 16 (App Router), Supabase (`soluvia-prod`, pg-meta migrations via `npm run db:migrate`), `ai` v6 + `@ai-sdk/anthropic`, `pg_trgm`, vitest (tests plats `__tests__/*.test.ts`), `noUncheckedIndexedAccess`.

Réf. spec : `docs/plans/2026-08-03-cerveau-phase1-design.md`.

---

### Task 1: Migration `brain_notes`

**Files:**

- Create: `supabase/migrations/20260803140000_brain_notes.sql`

- [ ] **Step 1: Écrire la migration**

```sql
create table if not exists public.brain_notes (
  id           uuid primary key default gen_random_uuid(),
  path         text unique not null,
  type         text not null check (type in ('fiche','livrable','conversation','entite')),
  title        text not null,
  aliases      text[] not null default '{}',
  tags         text[] not null default '{}',
  links        text[] not null default '{}',
  body         text not null,
  frontmatter  jsonb not null default '{}',
  source_ref   text,
  source_hash  text,
  updated_at   timestamptz not null default now()
);

create index if not exists brain_notes_type_idx on public.brain_notes (type);
create index if not exists brain_notes_source_ref_idx on public.brain_notes (source_ref);
create extension if not exists pg_trgm;
create index if not exists brain_notes_title_trgm on public.brain_notes using gin (title gin_trgm_ops);
create index if not exists brain_notes_body_trgm  on public.brain_notes using gin (body  gin_trgm_ops);

alter table public.brain_notes enable row level security;
create policy "brain lisible par admin"
  on public.brain_notes for select to authenticated
  using ((select public.is_admin()));

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

- [ ] **Step 2: Dry-run puis appliquer**

Run: `npm run db:migrate:dry` → doit lister `20260803140000_brain_notes.sql` en attente.
Run: `npm run db:migrate` → `✓ 1 migration(s) appliquée(s)`.

- [ ] **Step 3: Vérifier**

Run: `npm run db:migrate:dry` → « En attente : 0 ».

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803140000_brain_notes.sql
git commit -m "feat(cerveau): table brain_notes + search_brain_trgm"
```

---

### Task 2: Variables d'env + dépendance `@ai-sdk/anthropic`

**Files:**

- Modify: `lib/env.ts`
- Modify: `.env.example`
- Modify: `package.json` (via npm)

- [ ] **Step 1: Installer le provider Anthropic**

Run: `npm install @ai-sdk/anthropic`

- [ ] **Step 2: Ajouter les vars au schéma serveur** dans `lib/env.ts`, à l'intérieur de `serverSchema` (après le bloc `OPENAI_API_KEY`) :

```ts
    // Claude (Anthropic) - moteur du "cerveau" (ingestion + réponses assistant).
    // Optionnel : si absent, le cerveau est désactivé et l'assistant retombe
    // sur le RAG OpenAI existant.
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    // Coffre Obsidian du cerveau (dépôt GitHub). Optionnels : sans eux, l'écriture
    // GitHub est un no-op (le miroir Postgres reste la vérité runtime).
    BRAIN_GITHUB_REPO: z.string().min(1).optional(), // 'owner/repo'
    BRAIN_GITHUB_TOKEN: z.string().min(1).optional(),
    BRAIN_GITHUB_BRANCH: z.string().min(1).optional(),
```

- [ ] **Step 3: Ajouter au mapping `parseEnv().source`** dans `lib/env.ts` (après `OPENAI_API_KEY: ...`) :

```ts
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY?.trim(),
    BRAIN_GITHUB_REPO: process.env.BRAIN_GITHUB_REPO?.trim(),
    BRAIN_GITHUB_TOKEN: process.env.BRAIN_GITHUB_TOKEN?.trim(),
    BRAIN_GITHUB_BRANCH: process.env.BRAIN_GITHUB_BRANCH?.trim(),
```

- [ ] **Step 4: Documenter dans `.env.example`** (ajouter les 4 lignes, sans valeurs) :

```
ANTHROPIC_API_KEY=
BRAIN_GITHUB_REPO=
BRAIN_GITHUB_TOKEN=
BRAIN_GITHUB_BRANCH=main
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts .env.example package.json package-lock.json
git commit -m "feat(cerveau): env Claude + coffre GitHub + dépendance @ai-sdk/anthropic"
```

---

### Task 3: Types + `note.ts` (pur, TDD)

**Files:**

- Create: `lib/brain/types.ts`
- Create: `lib/brain/note.ts`
- Test: `__tests__/brain-note.test.ts`

- [ ] **Step 1: Types**

`lib/brain/types.ts` :

```ts
export type BrainNoteType = 'fiche' | 'livrable' | 'conversation' | 'entite';

export interface BrainNote {
  path: string; // 'fiches/lancement-a-1.md' (avec .md)
  type: BrainNoteType;
  title: string;
  aliases: string[];
  tags: string[];
  links: string[]; // cibles SANS extension, ex. 'entites/opco'
  body: string; // markdown (sans frontmatter)
  frontmatter: Record<string, unknown>;
  source_ref: string | null;
  source_hash: string | null;
}

export interface NoteAnalysis {
  title: string;
  summary: string;
  key_points: string[];
  entities: string[];
  aliases: string[];
  tags: string[];
}
```

- [ ] **Step 2: Test rouge**

`__tests__/brain-note.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  slugify,
  notePath,
  wikilink,
  linkTarget,
  buildMarkdown,
  parseFrontmatter,
  ficheToBrainNote,
} from '@/lib/brain/note';
import type { BrainNote } from '@/lib/brain/types';
import type { FinalizedFiche } from '@/lib/process/types';

describe('slugify / notePath / wikilink', () => {
  it('slug ASCII minuscule', () => {
    expect(slugify('Cadrage de la Création (M0–M1)')).toBe(
      'cadrage-de-la-creation-m0-m1',
    );
    expect(slugify('   ')).toBe('note');
  });
  it('notePath place dans le bon dossier avec .md', () => {
    expect(notePath('fiche', 'Lancement A.1')).toBe('fiches/lancement-a-1.md');
    expect(notePath('entite', 'OPCO')).toBe('entites/opco.md');
  });
  it('linkTarget/wikilink retirent .md', () => {
    expect(linkTarget('entites/opco.md')).toBe('entites/opco');
    expect(wikilink('entites/opco.md')).toBe('[[entites/opco]]');
    expect(wikilink('entites/opco')).toBe('[[entites/opco]]');
  });
});

describe('buildMarkdown / parseFrontmatter', () => {
  const note: BrainNote = {
    path: 'fiches/lancement-a-1.md',
    type: 'fiche',
    title: 'Cadrage (M0–M1)',
    aliases: ['Cadrage', 'M0-M1'],
    tags: ['lancement'],
    links: ['entites/opco', 'livrables/abc123'],
    body: '**Résumé.** Test.',
    frontmatter: {},
    source_ref: 'A.1',
    source_hash: 'h1',
  };
  it('sérialise frontmatter + wikilinks + corps', () => {
    const md = buildMarkdown(note);
    expect(md).toContain('type: fiche');
    expect(md).toContain('"Cadrage (M0–M1)"');
    expect(md).toContain('[[entites/opco]]');
    expect(md.trimEnd().endsWith('**Résumé.** Test.')).toBe(true);
  });
  it('round-trip du frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter(buildMarkdown(note));
    expect(frontmatter.type).toBe('fiche');
    expect(frontmatter.title).toBe('Cadrage (M0–M1)');
    expect(body).toBe('**Résumé.** Test.');
  });
});

describe('ficheToBrainNote', () => {
  const fiche: FinalizedFiche = {
    fiche_id: 'uuid-1',
    mission_code: 'A',
    mission_nom: 'Lancement',
    fiche_code: 'A.1',
    titre: 'Cadrage',
    priorite: null,
    contenu: '...',
    content_hash: 'h1',
    detail: {
      mission: { code: 'A', nom: 'Lancement' },
      fiche: {
        code: 'A.1',
        titre: 'Cadrage',
        description: null,
        priorite: null,
        statut: null,
      },
      taches: [
        {
          titre: 'T1',
          description: null,
          type: null,
          echeance: null,
          realise: false,
          valide_cdp: false,
          valide: false,
          responsable_nom: null,
          liens: [
            {
              libelle: 'Doc',
              url: 'https://drive.google.com/file/d/FILE42/view',
            },
          ],
        },
      ],
    },
    detail_hash: 'd1',
  };
  const analysis = {
    title: 'Cadrage de la création',
    summary: 'Résumé.',
    key_points: ['Point 1'],
    entities: ['OPCO'],
    aliases: ['M0-M1'],
    tags: ['lancement'],
  };
  it('construit une note fiche avec path stable (mission+code), source_ref=fiche_id, liens livrables', () => {
    const note = ficheToBrainNote(fiche, analysis);
    expect(note.path).toBe('fiches/lancement-a-1.md');
    expect(note.type).toBe('fiche');
    expect(note.source_ref).toBe('uuid-1');
    expect(note.source_hash).toBe('h1');
    expect(note.links).toContain('entites/opco');
    expect(note.links).toContain('livrables/FILE42');
    expect(note.body).toContain('Résumé.');
    expect(note.body).toContain('Point 1');
  });
});
```

Run: `npx vitest run __tests__/brain-note.test.ts` → FAIL (module absent).

- [ ] **Step 3: Implémenter `lib/brain/note.ts`**

```ts
import type { BrainNote, BrainNoteType, NoteAnalysis } from './types';
import type { FinalizedFiche } from '@/lib/process/types';
import { extractDriveFileId } from '@/lib/process/drive-url';

const FOLDER: Record<BrainNoteType, string> = {
  fiche: 'fiches',
  livrable: 'livrables',
  conversation: 'conversations',
  entite: 'entites',
};

export function slugify(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'note';
}

export function notePath(type: BrainNoteType, key: string): string {
  return `${FOLDER[type]}/${slugify(key)}.md`;
}

export function linkTarget(path: string): string {
  return path.replace(/\.md$/, '');
}

export function wikilink(path: string): string {
  return `[[${linkTarget(path)}]]`;
}

function yamlList(items: string[]): string {
  return `[${items.map((s) => JSON.stringify(s)).join(', ')}]`;
}

export function buildMarkdown(note: BrainNote): string {
  const fm = [
    '---',
    `type: ${note.type}`,
    `title: ${JSON.stringify(note.title)}`,
    ...(note.source_ref
      ? [`source_ref: ${JSON.stringify(note.source_ref)}`]
      : []),
    `aliases: ${yamlList(note.aliases)}`,
    `tags: ${yamlList(note.tags)}`,
    `links: ${yamlList(note.links.map((l) => wikilink(l)))}`,
    '---',
  ];
  return `${fm.join('\n')}\n\n${note.body.trim()}\n`;
}

export function parseFrontmatter(md: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md.trim() };
  const fm: Record<string, unknown> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!kv || !kv[1]) continue;
    const raw = (kv[2] ?? '').trim();
    try {
      fm[kv[1]] = JSON.parse(raw);
    } catch {
      fm[kv[1]] = raw;
    }
  }
  return { frontmatter: fm, body: (m[2] ?? '').trim() };
}

/** Corps Markdown d'une note de fiche, à partir de l'analyse Claude. Pur. */
function renderFicheBody(
  analysis: NoteAnalysis,
  entityLinks: string[],
): string {
  const points = analysis.key_points.map((p) => `- ${p}`).join('\n');
  const entites = entityLinks.map((l) => wikilink(l)).join(' · ');
  return [
    `# ${analysis.title}`,
    '',
    `**Résumé.** ${analysis.summary}`,
    '',
    '## Points clés',
    points || '- (aucun)',
    ...(entites ? ['', '## Entités', entites] : []),
  ].join('\n');
}

/** Construit la note-cerveau d'une fiche. Path stable (mission+code). Pur. */
export function ficheToBrainNote(
  fiche: FinalizedFiche,
  analysis: NoteAnalysis,
): BrainNote {
  const entityLinks = analysis.entities.map((e) => `entites/${slugify(e)}`);
  const deliverableLinks = fiche.detail.taches
    .flatMap((t) => t.liens)
    .map((l) => extractDriveFileId(l.url))
    .filter((id): id is string => !!id)
    .map((id) => `livrables/${id}`);
  const links = [...new Set([...entityLinks, ...deliverableLinks])];
  return {
    path: notePath('fiche', `${fiche.mission_nom}-${fiche.fiche_code}`),
    type: 'fiche',
    title: analysis.title,
    aliases: analysis.aliases,
    tags: analysis.tags,
    links,
    body: renderFicheBody(analysis, entityLinks),
    frontmatter: {},
    source_ref: fiche.fiche_id,
    source_hash: fiche.content_hash,
  };
}
```

- [ ] **Step 4: Test vert**

Run: `npx vitest run __tests__/brain-note.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brain/types.ts lib/brain/note.ts __tests__/brain-note.test.ts
git commit -m "feat(cerveau): types + note.ts (markdown, wikilinks, ficheToBrainNote) + tests"
```

---

### Task 4: `claude.ts` (analyse via Anthropic)

**Files:**

- Create: `lib/brain/claude.ts`

- [ ] **Step 1: Implémenter**

```ts
import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { NoteAnalysis } from './types';
import type { FinalizedFiche } from '@/lib/process/types';

// IDs modèles Anthropic. À confirmer contre la version installée de
// @ai-sdk/anthropic au moment de l'implémentation (cf. node_modules).
export const INGEST_MODEL = 'claude-haiku-4-5';
export const ANSWER_MODEL = 'claude-sonnet-5';

const NoteAnalysisSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(600),
  key_points: z.array(z.string()).max(12),
  entities: z.array(z.string()).max(15),
  aliases: z.array(z.string()).max(6),
  tags: z.array(z.string()).max(8),
});

export function anthropic() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const SYSTEM = `Tu analyses des fiches de process internes d'un organisme de formation (Soluvia) pour bâtir une base de connaissance.
Produis, en français, une synthèse réutilisable : titre clair, résumé (2-4 phrases), points clés actionnables, entités citées (OPCO, codes de ticket, missions, outils, livrables), alias/synonymes utiles pour la recherche, tags courts.
Synthétise, ne recopie pas. N'invente rien.`;

/** Analyse une fiche en note structurée. Lève si ANTHROPIC_API_KEY absent. */
export async function analyzeFiche(
  fiche: FinalizedFiche,
): Promise<NoteAnalysis> {
  const { object } = await generateObject({
    model: anthropic()(INGEST_MODEL),
    schema: NoteAnalysisSchema,
    system: SYSTEM,
    prompt: `Fiche ${fiche.fiche_code} — ${fiche.titre} (mission ${fiche.mission_nom}) :\n\n${fiche.contenu.slice(0, 12000)}`,
  });
  return object;
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit` → exit 0. (Si l'ID modèle ne type-check pas, ouvrir `node_modules/@ai-sdk/anthropic` pour le nom exact et corriger `INGEST_MODEL`/`ANSWER_MODEL`.)

- [ ] **Step 3: Commit**

```bash
git add lib/brain/claude.ts
git commit -m "feat(cerveau): analyse de fiche via Claude (generateObject)"
```

---

### Task 5: `github.ts` (écriture coffre, TDD)

**Files:**

- Create: `lib/brain/github.ts`
- Test: `__tests__/brain-github.test.ts`

- [ ] **Step 1: Test rouge** (mock global `fetch`)

`__tests__/brain-github.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv('BRAIN_GITHUB_REPO', 'me/vault');
  vi.stubEnv('BRAIN_GITHUB_TOKEN', 'tok');
  vi.stubEnv('BRAIN_GITHUB_BRANCH', 'main');
});

describe('putNote', () => {
  it('no-op si non configuré', async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const { putNote } = await import('@/lib/brain/github');
    const res = await putNote('fiches/x.md', 'body', 'msg');
    expect(res).toEqual({ ok: false, skipped: true });
  });

  it('crée le fichier (GET 404 → PUT sans sha)', async () => {
    vi.resetModules();
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        calls.push({
          url: u,
          method: init?.method ?? 'GET',
          body: init?.body as string,
        });
        if (!init?.method || init.method === 'GET')
          return new Response('', { status: 404 });
        return new Response(JSON.stringify({ content: {} }), { status: 201 });
      },
    ) as unknown as typeof fetch;
    const { putNote } = await import('@/lib/brain/github');
    const res = await putNote('fiches/x.md', 'body', 'msg');
    expect(res).toEqual({ ok: true });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).not.toContain('"sha"');
    expect(JSON.parse(put!.body as string).content).toBe(
      Buffer.from('body', 'utf8').toString('base64'),
    );
  });
});
```

Run: `npx vitest run __tests__/brain-github.test.ts` → FAIL.

- [ ] **Step 2: Implémenter `lib/brain/github.ts`**

```ts
import { env } from '@/lib/env';

export interface PutResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
}

/** Écrit/actualise un fichier du coffre GitHub (contents API). No-op si non configuré. */
export async function putNote(
  path: string,
  markdown: string,
  message: string,
): Promise<PutResult> {
  const repo = env.BRAIN_GITHUB_REPO;
  const token = env.BRAIN_GITHUB_TOKEN;
  const branch = env.BRAIN_GITHUB_BRANCH ?? 'main';
  if (!repo || !token) return { ok: false, skipped: true };

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const api = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'soluvia-brain',
  };

  let sha: string | undefined;
  const getRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, {
    headers,
    cache: 'no-store',
  });
  if (getRes.ok) {
    const json = (await getRes.json()) as { sha?: string };
    sha = json.sha;
  }

  const content = Buffer.from(markdown, 'utf8').toString('base64');
  const putRes = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) {
    console.error('[brain/github] putNote', path, putRes.status);
    return { ok: false, status: putRes.status };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Test vert**

Run: `npx vitest run __tests__/brain-github.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/github.ts __tests__/brain-github.test.ts
git commit -m "feat(cerveau): écriture des notes dans le coffre GitHub"
```

---

### Task 6: `sync.ts` (ingestion incrémentale, TDD)

**Files:**

- Create: `lib/brain/sync.ts`
- Test: `__tests__/brain-sync.test.ts`

- [ ] **Step 1: Test rouge** (fakes injectés — cœur : pas de réanalyse si hash inchangé)

`__tests__/brain-sync.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncBrainFiches } from '@/lib/brain/sync';
import type { FinalizedFiche } from '@/lib/process/types';

function fiche(id: string, hash: string): FinalizedFiche {
  return {
    fiche_id: id,
    mission_code: 'A',
    mission_nom: 'Lancement',
    fiche_code: 'A.1',
    titre: 'Cadrage',
    priorite: null,
    contenu: 'x',
    content_hash: hash,
    detail: {
      mission: { code: 'A', nom: 'Lancement' },
      fiche: {
        code: 'A.1',
        titre: 'Cadrage',
        description: null,
        priorite: null,
        statut: null,
      },
      taches: [],
    },
    detail_hash: 'd',
  };
}

// Admin factice : select renvoie `existing`, upsert enregistre les appels.
function fakeAdmin(
  existing: Array<{ source_ref: string; source_hash: string }>,
) {
  const upserts: unknown[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, upserts };
}

const analysis = {
  title: 'T',
  summary: 'S',
  key_points: [],
  entities: [],
  aliases: [],
  tags: [],
};

describe('syncBrainFiches', () => {
  it('saute une fiche au hash inchangé (0 analyse, 0 écriture)', async () => {
    const { admin, upserts } = fakeAdmin([
      { source_ref: '1', source_hash: 'h1' },
    ]);
    const analyze = vi.fn(async () => analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'h1')],
      analyze,
      putNote,
      admin,
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(putNote).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(res).toEqual({ analyzed: 0, skipped: 1, failed: 0 });
  });

  it('analyse + écrit une fiche nouvelle/modifiée', async () => {
    const { admin, upserts } = fakeAdmin([
      { source_ref: '1', source_hash: 'OLD' },
    ]);
    const analyze = vi.fn(async () => analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'NEW')],
      analyze,
      putNote,
      admin,
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(putNote).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect(res).toEqual({ analyzed: 1, skipped: 0, failed: 0 });
  });

  it("une analyse qui throw n'interrompt pas les autres", async () => {
    const { admin } = fakeAdmin([]);
    const analyze = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(analysis);
    const putNote = vi.fn(async () => ({ ok: true }));
    const res = await syncBrainFiches({
      fetchSource: async () => [fiche('1', 'a'), fiche('2', 'b')],
      analyze,
      putNote,
      admin,
    });
    expect(res).toEqual({ analyzed: 1, skipped: 0, failed: 1 });
  });
});
```

Run: `npx vitest run __tests__/brain-sync.test.ts` → FAIL.

- [ ] **Step 2: Implémenter `lib/brain/sync.ts`**

```ts
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
```

- [ ] **Step 3: Test vert**

Run: `npx vitest run __tests__/brain-sync.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/sync.ts __tests__/brain-sync.test.ts
git commit -m "feat(cerveau): ingestion incrémentale des fiches (sync) + tests"
```

---

### Task 7: `retrieve.ts` (recherche notes, TDD)

**Files:**

- Create: `lib/brain/retrieve.ts`
- Test: `__tests__/brain-retrieve.test.ts`

- [ ] **Step 1: Test rouge**

`__tests__/brain-retrieve.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { retrieveNotes } from '@/lib/brain/retrieve';

function row(path: string, links: string[] = []) {
  return {
    path,
    type: 'fiche',
    title: path,
    aliases: [],
    tags: [],
    links,
    body: 'b',
    frontmatter: {},
    source_ref: null,
    source_hash: null,
  };
}

// Admin factice : rpc renvoie les graines, .in() renvoie les notes liées.
function fakeAdmin(seeds: unknown[], linked: unknown[]) {
  return {
    rpc: async () => ({ data: seeds, error: null }),
    from: () => ({
      select: () => ({ in: async () => ({ data: linked, error: null }) }),
    }),
  } as unknown as SupabaseClient;
}

describe('retrieveNotes', () => {
  it('renvoie [] pour une question vide', async () => {
    const notes = await retrieveNotes('  ', { admin: fakeAdmin([], []) });
    expect(notes).toEqual([]);
  });

  it('graines + expansion 1 saut, dédupliqué', async () => {
    const admin = fakeAdmin(
      [row('fiches/a.md', ['entites/opco'])],
      [row('entites/opco.md')],
    );
    const notes = await retrieveNotes('opco', { admin });
    const paths = notes.map((n) => n.path);
    expect(paths).toContain('fiches/a.md');
    expect(paths).toContain('entites/opco.md');
    expect(paths).toHaveLength(2);
  });
});
```

Run: `npx vitest run __tests__/brain-retrieve.test.ts` → FAIL.

- [ ] **Step 2: Implémenter `lib/brain/retrieve.ts`**

```ts
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
```

- [ ] **Step 3: Test vert**

Run: `npx vitest run __tests__/brain-retrieve.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/retrieve.ts __tests__/brain-retrieve.test.ts
git commit -m "feat(cerveau): recherche notes (pg_trgm + graphe) + tests"
```

---

### Task 8: Cron `brain-sync` + `vercel.json`

**Files:**

- Create: `app/api/cron/brain-sync/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Route cron**

`app/api/cron/brain-sync/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFinalizedFiches } from '@/lib/process/source';
import { env } from '@/lib/env';
import { analyzeFiche } from '@/lib/brain/claude';
import { putNote } from '@/lib/brain/github';
import { syncBrainFiches } from '@/lib/brain/sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Ingestion quotidienne des fiches dans le cerveau (Claude). Auth CRON_SECRET.
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  if (!env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { ok: false, error: 'ai_not_configured' },
      { status: 503 },
    );
  if (!env.PROCESS_SOURCE_URL)
    return NextResponse.json(
      { ok: false, error: 'source_not_configured' },
      { status: 500 },
    );

  try {
    const result = await syncBrainFiches({
      fetchSource: fetchFinalizedFiches,
      analyze: analyzeFiche,
      putNote,
      admin: createAdminClient(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(
      '[cron/brain-sync] échec:',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { ok: false, error: 'sync_failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Ajouter au `crons` de `vercel.json`** (une entrée, après `process-sync` ou à la fin du tableau `crons`) :

```json
{
  "path": "/api/cron/brain-sync",
  "schedule": "30 4 * * *"
}
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm run build` → build OK, route `/api/cron/brain-sync` présente dans la sortie.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/brain-sync/route.ts vercel.json
git commit -m "feat(cerveau): cron brain-sync (ingestion fiches)"
```

---

### Task 9: Bascule de l'assistant sur Claude + cerveau

**Files:**

- Create: `lib/brain/answer.ts`
- Modify: `app/api/process/ask/route.ts`

- [ ] **Step 1: Builder de messages ancrés sur les notes**

`lib/brain/answer.ts` :

```ts
import type { ChatMsg } from '@/lib/process/rag';
import type { BrainNote } from './types';

const SYSTEM = `Tu es l'assistant des process internes de Soluvia (organisme de formation).
Réponds à la conversation en te basant UNIQUEMENT sur les notes fournies (numérotées [1], [2], …).
- Cite tes affirmations avec le numéro de la note source, ex. « … selon [1] ».
- Sois concret et actionnable ; structure (étapes, points clés) en markdown concis, en français.
- Si l'information n'est pas dans les notes, dis-le (« Je ne trouve pas cette information dans les process finalisés ») et n'invente rien.`;

/** Messages ancrés sur les notes du cerveau (même forme que buildChatMessages). */
export function buildBrainChatMessages(
  history: ChatMsg[],
  notes: BrainNote[],
): { system: string; messages: ChatMsg[] } {
  const contexte = notes.length
    ? notes.map((n, i) => `[${i + 1}] ${n.title}\n${n.body}`).join('\n\n')
    : '(aucune note disponible)';
  const preface: ChatMsg = {
    role: 'user',
    content: `Notes de connaissance disponibles (source des réponses) :\n\n${contexte}\n\n---\nUtilise ces notes pour répondre à la conversation ci-dessous.`,
  };
  return { system: SYSTEM, messages: [preface, ...history] };
}

/** Sources exposées à l'UI (mêmes champs que le RAG actuel). */
export function notesToSources(notes: BrainNote[]) {
  return notes.map((n) => ({
    source_fiche_id: n.source_ref ?? '',
    titre: n.title,
    mission: n.tags[0] ?? '',
    url: n.source_ref ? `/process/fiches/${n.source_ref}` : '/process',
  }));
}
```

- [ ] **Step 2: Basculer la route** `app/api/process/ask/route.ts`.

Remplacer le bloc de garde IA + retrieval + génération (à partir de la ligne `if (!env.OPENAI_API_KEY) ...` jusqu'au `return result.toTextStreamResponse(...)` final) par :

```ts
// Au moins un moteur IA doit être configuré.
if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY)
  return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

// Chemin CERVEAU (Claude, sans OpenAI) si ANTHROPIC_API_KEY présent.
if (env.ANTHROPIC_API_KEY) {
  const { retrieveNotes } = await import('@/lib/brain/retrieve');
  const { buildBrainChatMessages, notesToSources } =
    await import('@/lib/brain/answer');
  const { anthropic, ANSWER_MODEL } = await import('@/lib/brain/claude');
  const { createAdminClient } = await import('@/lib/supabase/admin');

  const notes = await retrieveNotes(question, { admin: createAdminClient() });
  const sources = notesToSources(notes);
  const { system, messages: modelMsgs } = buildBrainChatMessages(
    messages,
    notes,
  );
  const result = streamText({
    model: anthropic()(ANSWER_MODEL),
    system,
    messages: modelMsgs,
    temperature: 0.2,
  });
  return result.toTextStreamResponse({
    headers: {
      'x-process-sources': encodeURIComponent(JSON.stringify(sources)),
    },
  });
}

// Fallback OpenAI (RAG embeddings existant).
const fiches = await retrieveContext(question, { admin: supabase });
const sources = fiches.map((f) => ({
  source_fiche_id: f.source_fiche_id,
  titre: f.titre,
  mission: f.mission,
  url: f.url,
}));
const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
const { system, messages: modelMsgs } = buildChatMessages(messages, fiches);
const result = streamText({
  model: openai('gpt-4o-mini'),
  system,
  messages: modelMsgs,
  temperature: 0.2,
});
return result.toTextStreamResponse({
  headers: { 'x-process-sources': encodeURIComponent(JSON.stringify(sources)) },
});
```

(Les `import` dynamiques évitent de charger le chemin cerveau quand seul OpenAI est configuré et gardent le diff local. `createOpenAI` reste importé en tête de fichier.)

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm run build` → OK.
Run: `npx vitest run __tests__/brain-*.test.ts` → tous verts.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/answer.ts app/api/process/ask/route.ts
git commit -m "feat(cerveau): assistant répond via Claude + cerveau (fallback OpenAI)"
```

---

### Task 10: Vérification finale & déploiement

- [ ] **Step 1: Suite complète**

Run: `npx tsc --noEmit && npm run lint && npm run build && npx vitest run` → tout vert.

- [ ] **Step 2: Amorcer le cerveau (prod)**

Après déploiement + config des env (`ANTHROPIC_API_KEY`, `BRAIN_GITHUB_*`) :
Run: `curl -H "Authorization: Bearer <CRON_SECRET>" https://app.mysoluvia.com/api/cron/brain-sync` → `{ ok: true, analyzed: N, skipped: 0, failed: 0 }`.

- [ ] **Step 3: Vérifier**
- `brain_notes` contient N notes (une par fiche finalisée).
- Le coffre GitHub contient les `.md` correspondants.
- L'assistant (`/process`) répond avec citations — réponses générées par Claude (vérifier via logs / absence d'appel OpenAI).

- [ ] **Step 4: Finaliser la branche** (superpowers:finishing-a-development-branch) → PR → CI → merge.

## Self-review (couverture spec)

| Élément de la spec                                    | Tâche |
| ----------------------------------------------------- | ----- |
| Table `brain_notes` + `search_brain_trgm` + RLS admin | 1     |
| Env Claude + coffre GitHub + `@ai-sdk/anthropic`      | 2     |
| Format note (markdown, wikilinks, ficheToBrainNote)   | 3     |
| Analyse Claude (`generateObject`, haiku)              | 4     |
| Écriture coffre GitHub (contents API)                 | 5     |
| Ingestion incrémentale (hash → pas de réanalyse)      | 6     |
| Recherche pg_trgm + expansion graphe                  | 7     |
| Cron `brain-sync` + vercel.json                       | 8     |
| Bascule assistant Claude + cerveau, fallback OpenAI   | 9     |
| Vérif e2e + amorçage prod                             | 10    |

**Vigilance :** (1) IDs modèles `@ai-sdk/anthropic` à confirmer contre `node_modules` (Task 4). (2) `retrieveNotes` utilise le client **admin** (RLS brain_notes = admin only) — OK car la route authentifie déjà l'utilisateur et n'expose que réponses+sources. (3) `path` dérivé de `mission+fiche_code` (stable) pour que l'upsert `onConflict:path` mette à jour au lieu de dupliquer quand le titre change.

```

```
