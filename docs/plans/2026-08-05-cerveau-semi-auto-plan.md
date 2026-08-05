# Cerveau semi-automatique — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche.
> Les étapes utilisent la syntaxe checkbox (`- [ ]`) pour le suivi.

**Objectif :** faire passer tout ce que le cerveau dérive (conversations 👍, entités, lacunes 👎,
obsolescence) par une validation humaine dans `/admin/cerveau`, au lieu d'une écriture directe
dans `brain_notes`.

**Architecture :** le script local `brain:ingest` (seul à pouvoir appeler Claude, via `claude -p`
sur l'abonnement Max) dépose des **propositions** dans une table `brain_proposals` ; une page
admin les arbitre ; l'approbation écrit dans `brain_notes`. L'idempotence est portée par
`unique(kind, source_ref)` + `source_hash`, ce qui rend un rejet durable. En parallèle, la dette
de lecture est corrigée : `retrieveNotes` repasse par la RLS au lieu du client service-role.

**Stack :** Next.js (App Router, Server Actions), TypeScript, Supabase self-hosted (Supavia,
migrations appliquées par `npm run db:migrate` / CI sur `main`), Vitest, Tailwind + shadcn/ui.

**Spec :** `docs/plans/2026-08-05-cerveau-semi-auto-design.md`
**Branche :** `feat/cerveau-semi-auto`

**Écart assumé vs. spec §3 :** la spec décrivait une route `POST /api/admin/brain/proposals/[id]`.
Le dépôt fait ses mutations admin par Server Actions (`lib/actions/*` + `lib/queries/*`,
guard `checkAuth`). Le plan suit la convention du dépôt.

---

## Structure des fichiers

**Créés**
- `supabase/migrations/20260805100000_brain_proposals.sql` — table, index, RLS, ouverture de la lecture de `brain_notes`
- `lib/brain/proposal.ts` — logique pure : décision de proposer, note ↔ proposition, lacune → note
- `lib/queries/brain-proposals.ts` — lectures de la page admin
- `lib/actions/brain-proposals.ts` — Server Actions d'arbitrage (approuver / rejeter / régénérer / résoudre une lacune)
- `app/(dashboard)/admin/cerveau/page.tsx` — page server, garde admin
- `app/(dashboard)/admin/cerveau/loading.tsx`
- `app/(dashboard)/admin/cerveau/proposals-review.tsx` — composant client (liste + détail + actions)
- `__tests__/brain-proposal.test.ts`

**Modifiés**
- `lib/brain/retrieve.ts` — dépendance `admin` → `db` (client de l'utilisateur)
- `app/api/process/ask/route.ts:76-80` — passe le client de session au lieu du client admin
- `app/api/process/feedback/route.ts` — sur 👎, crée la proposition `lacune`
- `scripts/brain-ingest.ts` — les 3 fonctions Phase 3 proposent au lieu d'écrire ; consomme `a_regenerer`
- `__tests__/brain-retrieve.test.ts` — s'aligne sur la nouvelle dépendance
- `types/database.ts` — types de `brain_proposals`
- le composant de navigation admin — lien vers `/admin/cerveau`

---

## Task 1 : Migration `brain_proposals` + ouverture de la lecture du cerveau

**Fichiers :**
- Créer : `supabase/migrations/20260805100000_brain_proposals.sql`
- Modifier : `types/database.ts`

- [ ] **Étape 1 : écrire la migration**

```sql
-- Propositions du cerveau : tout ce qui est DÉRIVÉ (conversations 👍, entités,
-- lacunes 👎, obsolescence) passe par une validation admin avant d'entrer dans
-- brain_notes. Les notes fiche/livrable/document restent écrites en direct par
-- le script d'ingestion : ce sont des reflets de sources de vérité.
create table if not exists public.brain_proposals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('conversation','entite','lacune','obsolescence')),
  status      text not null default 'en_attente'
              check (status in ('en_attente','approuvee','rejetee','a_regenerer')),
  target_path text,
  payload     jsonb not null,
  source_ref  text not null,
  source_hash text not null,
  reason      text,
  decided_by  uuid references public.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (kind, source_ref)
);

create index if not exists brain_proposals_status_kind_idx
  on public.brain_proposals (status, kind);

alter table public.brain_proposals enable row level security;

create policy "propositions lisibles par admin"
  on public.brain_proposals for select to authenticated
  using ((select public.is_admin()));

create policy "propositions arbitrees par admin"
  on public.brain_proposals for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Lecture du cerveau : le contenu indexé (fiches finalisées, livrables et
-- documents Drive « SOLUVIA BRAIN », entités, conversations validées) est de la
-- documentation interne lisible par tout salarié. On ouvre donc le select à
-- `authenticated` et on supprime le contournement service-role de retrieveNotes
-- (cf. lib/brain/retrieve.ts) : la RLS redevient la seule source de vérité, et
-- le garde-fou porte sur ce qui ENTRE dans le cerveau (brain_proposals).
drop policy if exists "brain lisible par admin" on public.brain_notes;
create policy "brain lisible par tout utilisateur connecte"
  on public.brain_notes for select to authenticated
  using (true);
```

- [ ] **Étape 2 : vérifier que la migration est bien détectée comme en attente**

Lancer : `npm run db:migrate:dry`
Attendu : la sortie liste `20260805100000_brain_proposals.sql` comme migration en attente.

- [ ] **Étape 3 : appliquer**

Lancer : `npm run db:migrate`
Attendu : migration appliquée, aucune erreur.

- [ ] **Étape 4 : ajouter les types**

Dans `types/database.ts`, à côté du bloc `brain_notes` (≈ ligne 901), dans
`Database['public']['Tables']`, insérer :

```ts
      brain_proposals: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          kind: string;
          payload: Json;
          reason: string | null;
          source_hash: string;
          source_ref: string;
          status: string;
          target_path: string | null;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          kind: string;
          payload: Json;
          reason?: string | null;
          source_hash: string;
          source_ref: string;
          status?: string;
          target_path?: string | null;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          kind?: string;
          payload?: Json;
          reason?: string | null;
          source_hash?: string;
          source_ref?: string;
          status?: string;
          target_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'brain_proposals_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
```

- [ ] **Étape 5 : vérifier la compilation**

Lancer : `npm run typecheck`
Attendu : aucune erreur.

- [ ] **Étape 6 : commit**

```bash
git add supabase/migrations/20260805100000_brain_proposals.sql types/database.ts
git commit -m "feat(cerveau): table brain_proposals + lecture du cerveau par la RLS"
```

---

## Task 2 : `shouldPropose` — la règle d'idempotence

C'est le cœur du comportement : ne pas reproposer ce qui est inchangé, y compris ce qui a été
rejeté (sinon la file se remplit du même refus à chaque run), mais rouvrir dès que le contenu
change (le contenu refusé n'est plus celui qu'on propose).

**Fichiers :**
- Créer : `lib/brain/proposal.ts`
- Test : `__tests__/brain-proposal.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { shouldPropose, type BrainProposal } from '@/lib/brain/proposal';

const proposal: BrainProposal = {
  kind: 'conversation',
  status: 'en_attente',
  target_path: 'conversations/comment-facturer.md',
  payload: { path: 'conversations/comment-facturer.md' },
  source_ref: 'feedback-1',
  source_hash: 'hash-a',
};

describe('shouldPropose', () => {
  it('insère quand rien n existe', () => {
    expect(shouldPropose(proposal, null)).toBe('insert');
  });

  it('ignore un contenu inchangé, quel que soit le statut', () => {
    for (const status of ['en_attente', 'approuvee', 'rejetee', 'a_regenerer'] as const) {
      expect(shouldPropose(proposal, { status, source_hash: 'hash-a' })).toBe('skip');
    }
  });

  it('rouvre une proposition rejetée dont le contenu a changé', () => {
    expect(shouldPropose(proposal, { status: 'rejetee', source_hash: 'hash-b' })).toBe('reopen');
  });

  it('rouvre aussi une proposition déjà approuvée dont la source a changé', () => {
    expect(shouldPropose(proposal, { status: 'approuvee', source_hash: 'hash-b' })).toBe('reopen');
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "@/lib/brain/proposal"`.

- [ ] **Étape 3 : implémentation minimale**

```ts
import { createHash } from 'node:crypto';
import type { BrainNote } from './types';

export type ProposalKind = 'conversation' | 'entite' | 'lacune' | 'obsolescence';
export type ProposalStatus = 'en_attente' | 'approuvee' | 'rejetee' | 'a_regenerer';

export interface BrainProposal {
  kind: ProposalKind;
  status: ProposalStatus;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
}

/**
 * Décide quoi faire d'une proposition face à ce qui existe déjà en base. Pur.
 *
 * `skip` sur hash identique quel que soit le statut : un rejet est DURABLE, on
 * ne repropose pas le même contenu à chaque run. `reopen` dès que le hash change :
 * le contenu refusé n'est plus celui qu'on propose, l'admin doit re-arbitrer.
 */
export function shouldPropose(
  next: BrainProposal,
  existing: { status: ProposalStatus; source_hash: string } | null,
): 'skip' | 'insert' | 'reopen' {
  if (!existing) return 'insert';
  if (existing.source_hash === next.source_hash) return 'skip';
  return 'reopen';
}

/** Hash de repli quand la note ne porte pas de source_hash. Pur. */
export function hashNote(note: BrainNote): string {
  return createHash('sha256')
    .update(`${note.path}|${note.title}|${note.body}`)
    .digest('hex');
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : 4 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add lib/brain/proposal.ts __tests__/brain-proposal.test.ts
git commit -m "feat(cerveau): shouldPropose — idempotence et rejet durable"
```

---

## Task 3 : `noteToProposal` / `applyProposal`

**Fichiers :**
- Modifier : `lib/brain/proposal.ts`
- Test : `__tests__/brain-proposal.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

Ajouter à `__tests__/brain-proposal.test.ts` (compléter l'import en tête du fichier avec
`noteToProposal, applyProposal`) :

```ts
import type { BrainNote } from '@/lib/brain/types';

const note: BrainNote = {
  path: 'conversations/comment-facturer.md',
  type: 'conversation',
  title: 'Comment facturer un OPCO ?',
  aliases: [],
  tags: ['faq'],
  links: ['fiches/lancement-a-1'],
  body: '# Comment facturer un OPCO ?\n\nRéponse.',
  frontmatter: { derived_from: ['fiches/lancement-a-1'] },
  source_ref: 'feedback-1',
  source_hash: 'hash-qa',
};

describe('noteToProposal', () => {
  it('construit une proposition à partir de la note', () => {
    const p = noteToProposal(note);
    expect(p.kind).toBe('conversation');
    expect(p.target_path).toBe('conversations/comment-facturer.md');
    expect(p.source_ref).toBe('feedback-1');
    expect(p.source_hash).toBe('hash-qa');
  });

  it('refuse une note sans source_hash', () => {
    // Pas de repli silencieux : tous les constructeurs de notes renseignent
    // source_hash. Une note sans hash est un bug d'appelant, pas un cas normal —
    // un repli inventerait un hash qui ne suivrait pas la source.
    expect(() => noteToProposal({ ...note, source_hash: null })).toThrow(/source_hash/);
  });

  it('refuse un type non dérivé', () => {
    expect(() => noteToProposal({ ...note, type: 'fiche' })).toThrow(/non proposable/);
  });
});

describe('applyProposal', () => {
  it('rend la note du payload', () => {
    expect(applyProposal(noteToProposal(note))).toEqual(note);
  });

  it('remplace le corps quand l admin a édité', () => {
    const applied = applyProposal(noteToProposal(note), '  # Corrigé\n\nMieux.  ');
    expect(applied.body).toBe('# Corrigé\n\nMieux.');
    expect(applied.title).toBe('Comment facturer un OPCO ?');
  });

  it('refuse une proposition qui ne porte pas de note', () => {
    const lacune = { ...noteToProposal(note), kind: 'lacune' as const };
    expect(() => applyProposal(lacune)).toThrow(/non applicable/);
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : ÉCHEC — `noteToProposal is not a function`.

- [ ] **Étape 3 : implémenter dans `lib/brain/proposal.ts`**

```ts
/**
 * Proposition à partir d'une note dérivée déjà construite. `kind` est dérivé de
 * `note.type` : seuls `conversation` et `entite` passent par la validation — les
 * notes fiche/livrable/document reflètent des sources de vérité et sont écrites
 * en direct. Pur.
 */
export function noteToProposal(note: BrainNote): BrainProposal {
  if (note.type !== 'conversation' && note.type !== 'entite') {
    throw new Error(`type non proposable : ${note.type}`);
  }
  if (!note.source_hash) {
    throw new Error(`note sans source_hash : ${note.path}`);
  }
  return {
    kind: note.type,
    target_path: note.path,
    payload: note as unknown as Record<string, unknown>,
    source_ref: note.source_ref ?? note.path,
    source_hash: note.source_hash,
  };
}

/**
 * payload d'une proposition → note prête à upsert. `editedBody` = corps corrigé
 * par l'admin dans la page de revue. Ne concerne que `conversation` et `entite`,
 * dont le payload EST une note : `lacune` passe par `gapToBrainNote`, et
 * `obsolescence` ne produit pas de note (arbitrage sur une note existante). Pur.
 */
export function applyProposal(p: BrainProposal, editedBody?: string): BrainNote {
  if (p.kind !== 'conversation' && p.kind !== 'entite') {
    throw new Error(`proposition non applicable directement : ${p.kind}`);
  }
  const note = p.payload as unknown as BrainNote;
  const body = editedBody?.trim();
  return body ? { ...note, body } : note;
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : tous PASS.

- [ ] **Étape 5 : commit**

```bash
git add lib/brain/proposal.ts __tests__/brain-proposal.test.ts
git commit -m "feat(cerveau): noteToProposal / applyProposal"
```

---

## Task 4 : `gapToBrainNote` — une lacune 👎 + la réponse de l'admin → une note

**Fichiers :**
- Modifier : `lib/brain/proposal.ts`
- Test : `__tests__/brain-proposal.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

Ajouter (et compléter l'import avec `gapToBrainNote`) :

```ts
describe('gapToBrainNote', () => {
  const gap = {
    id: 'feedback-9',
    question: 'Quel délai pour transmettre le BPF ?',
    answer_ko: 'Je ne trouve pas cette information.',
  };

  it('construit une note conversation depuis la réponse humaine', () => {
    const n = gapToBrainNote(gap, '  Avant le 31 mai de chaque année.  ',
      ['fiches/qualite-g-2'], { 'fiches/qualite-g-2': 'h1' });
    expect(n.type).toBe('conversation');
    expect(n.path).toBe('conversations/quel-delai-pour-transmettre-le-bpf.md');
    expect(n.title).toBe(gap.question);
    expect(n.body).toContain('Avant le 31 mai de chaque année.');
    expect(n.body).toContain('[[fiches/qualite-g-2]]');
    expect(n.body).not.toContain('Je ne trouve pas');
    expect(n.links).toEqual(['fiches/qualite-g-2']);
    expect(n.frontmatter).toMatchObject({
      derived_from: ['fiches/qualite-g-2'],
      source_hashes: { 'fiches/qualite-g-2': 'h1' },
      corrige: true,
    });
    expect(n.source_ref).toBe('feedback-9');
  });

  it('hash stable et sensible à la réponse', () => {
    const a = gapToBrainNote(gap, 'Avant le 31 mai.', [], {});
    const b = gapToBrainNote(gap, 'Avant le 31 mai.', [], {});
    const c = gapToBrainNote(gap, 'Avant le 30 juin.', [], {});
    expect(a.source_hash).toBe(b.source_hash);
    expect(a.source_hash).not.toBe(c.source_hash);
  });

  it('tronque le path des questions très longues', () => {
    const longue = { ...gap, question: 'a'.repeat(200) };
    const n = gapToBrainNote(longue, 'Réponse.', [], {});
    expect(n.path.length).toBeLessThanOrEqual('conversations/'.length + 80 + 3);
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : ÉCHEC — `gapToBrainNote is not a function`.

- [ ] **Étape 3 : implémenter dans `lib/brain/proposal.ts`**

Compléter l'import en tête du fichier : `import { slugify, wikilink } from './note';`

```ts
export interface GapInput {
  id: string;
  question: string;
  answer_ko: string;
}

/**
 * Lacune (👎) + réponse rédigée par un admin → note `conversation`. La mauvaise
 * réponse n'entre PAS dans la note : elle ne sert qu'à contextualiser l'arbitrage
 * dans la page de revue. Le path est celui d'une note de conversation classique,
 * donc l'upsert écrase une éventuelle note issue de la même question. Pur.
 */
export function gapToBrainNote(
  gap: GapInput,
  humanAnswer: string,
  derivedFrom: string[],
  sourceHashes: Record<string, string>,
): BrainNote {
  const answer = humanAnswer.trim();
  const links = [...new Set(derivedFrom.map((p) => p.replace(/\.md$/, '')))];
  const body = [
    `# ${gap.question}`,
    '',
    "> Réponse rédigée et validée par un administrateur (correction d'une lacune 👎).",
    '',
    answer,
    ...(links.length ? ['', '## Sources', links.map(wikilink).join(' · ')] : []),
  ].join('\n');
  return {
    path: `conversations/${slugify(gap.question).slice(0, 80)}.md`,
    type: 'conversation',
    title: gap.question,
    aliases: [],
    tags: ['faq'],
    links,
    body,
    frontmatter: {
      derived_from: links,
      source_hashes: sourceHashes,
      corrige: true,
    },
    source_ref: gap.id,
    source_hash: createHash('sha256')
      .update(`${gap.question}|${answer}`)
      .digest('hex'),
  };
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

Lancer : `npx vitest run __tests__/brain-proposal.test.ts`
Attendu : tous PASS.

- [ ] **Étape 5 : commit**

```bash
git add lib/brain/proposal.ts __tests__/brain-proposal.test.ts
git commit -m "feat(cerveau): gapToBrainNote — une lacune corrigee devient une note"
```

---

## Task 5 : dette de lecture — `retrieveNotes` repasse par la RLS

La policy `select` a été ouverte à `authenticated` en Task 1. Il reste à supprimer le
contournement service-role côté code.

**Fichiers :**
- Modifier : `lib/brain/retrieve.ts`
- Modifier : `app/api/process/ask/route.ts:76-80`
- Test : `__tests__/brain-retrieve.test.ts`

- [ ] **Étape 1 : adapter le test (il échouera)**

Dans `__tests__/brain-retrieve.test.ts` : renommer `fakeAdmin` en `fakeDb`, et remplacer les
trois appels `retrieveNotes(..., { admin: ... })` par `retrieveNotes(..., { db: ... })`.
Ajouter ce test :

```ts
it('utilise le client fourni (plus de client admin implicite)', async () => {
  let called = false;
  const db = {
    rpc: async () => {
      called = true;
      return { data: [row('fiches/a.md')], error: null };
    },
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  } as unknown as SupabaseClient;
  await retrieveNotes('opco', { db });
  expect(called).toBe(true);
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Lancer : `npx vitest run __tests__/brain-retrieve.test.ts`
Attendu : ÉCHEC de compilation TypeScript — `db` n'existe pas sur le type des dépendances.

- [ ] **Étape 3 : modifier `lib/brain/retrieve.ts`**

Remplacer le bloc de commentaire « DETTE Phase 2/3 » et la signature par :

```ts
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
```

Puis remplacer l'unique autre occurrence, `await admin.from('brain_notes')`, par
`await db.from('brain_notes')`.

- [ ] **Étape 4 : modifier l'appelant `app/api/process/ask/route.ts`**

Remplacer les lignes 79-80 :

```ts
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const notes = await retrieveNotes(question, { admin: createAdminClient() });
```

par :

```ts
  const notes = await retrieveNotes(question, { db: supabase });
```

Et dans le commentaire juste au-dessus (« 1) CERVEAU d'abord … »), ajouter en fin de bloc :
`//    Lecture via le client de session : la RLS de brain_notes fait foi.`

- [ ] **Étape 5 : vérifier**

Lancer : `npx vitest run __tests__/brain-retrieve.test.ts && npm run typecheck`
Attendu : tests PASS, aucune erreur TypeScript. Si `createAdminClient` n'est plus utilisé
ailleurs dans `ask/route.ts`, l'import dynamique a bien été supprimé (vérifier avec
`grep -n createAdminClient app/api/process/ask/route.ts` → aucune sortie).

- [ ] **Étape 6 : commit**

```bash
git add lib/brain/retrieve.ts app/api/process/ask/route.ts __tests__/brain-retrieve.test.ts
git commit -m "fix(cerveau): retrieveNotes passe par la RLS au lieu du service-role"
```

---

## Task 6 : lectures pour la page admin

**Fichiers :**
- Créer : `lib/queries/brain-proposals.ts`

- [ ] **Étape 1 : écrire le module**

```ts
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { ProposalKind, ProposalStatus } from '@/lib/brain/proposal';

export interface ProposalRow {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
  reason: string | null;
  created_at: string;
}

/** Propositions à arbitrer, les plus anciennes d'abord (FIFO). */
export async function getPendingProposals(): Promise<ProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brain_proposals')
    .select(
      'id, kind, status, target_path, payload, source_ref, source_hash, reason, created_at',
    )
    .eq('status', 'en_attente')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    logger.error('queries.brain-proposals', 'getPendingProposals failed', {
      error,
    });
    throw error;
  }
  return (data ?? []) as ProposalRow[];
}

/** Compteurs par kind, pour les titres de section. */
export async function getPendingCounts(): Promise<Record<string, number>> {
  const rows = await getPendingProposals();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
```

- [ ] **Étape 2 : vérifier la compilation**

Lancer : `npm run typecheck`
Attendu : aucune erreur.

- [ ] **Étape 3 : commit**

```bash
git add lib/queries/brain-proposals.ts
git commit -m "feat(cerveau): lectures des propositions en attente"
```

---

## Task 7 : Server Actions d'arbitrage

**Fichiers :**
- Créer : `lib/actions/brain-proposals.ts`

- [ ] **Étape 1 : écrire le module**

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { checkAuth } from '@/lib/auth/guards';
import { isAdmin } from '@/lib/utils/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyProposal, gapToBrainNote, type BrainProposal } from '@/lib/brain/proposal';
import type { BrainNote } from '@/lib/brain/types';
import { logger } from '@/lib/utils/logger';

type Result = { success: boolean; error?: string };

const ApproveSchema = z.object({
  id: z.string().uuid(),
  editedBody: z.string().max(50000).optional(),
});
const RejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
const GapSchema = z.object({
  id: z.string().uuid(),
  answer: z.string().min(1).max(20000),
});
const StaleSchema = z.object({
  id: z.string().uuid(),
  choix: z.enum(['garder', 'archiver', 'regenerer']),
});

/** Admin + client service-role (la RLS de brain_notes n'ouvre que le select). */
async function adminGate() {
  const auth = await checkAuth();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (!isAdmin(auth.role)) return { ok: false as const, error: 'Réservé aux admins' };
  return { ok: true as const, userId: auth.user.id, db: createAdminClient() };
}

/** Écrit la note dans brain_notes (upsert par path). */
async function upsertNote(
  db: ReturnType<typeof createAdminClient>,
  note: BrainNote,
): Promise<string | null> {
  const { error } = await db.from('brain_notes').upsert(
    {
      path: note.path,
      type: note.type,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      links: note.links,
      body: note.body,
      frontmatter: note.frontmatter as never,
      source_ref: note.source_ref,
      source_hash: note.source_hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'path' },
  );
  return error ? error.message : null;
}

/**
 * Transition conditionnelle : `where status = 'en_attente'` garantit qu'un
 * double-clic (ou deux onglets) ne produit pas deux écritures. 0 ligne
 * affectée = déjà traité.
 */
async function decide(
  db: ReturnType<typeof createAdminClient>,
  id: string,
  status: string,
  userId: string,
  reason?: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('brain_proposals')
    .update({
      status,
      reason: reason ?? null,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'en_attente')
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function loadPending(
  db: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<BrainProposal & { id: string }> {
  const { data, error } = await db
    .from('brain_proposals')
    .select('id, kind, status, target_path, payload, source_ref, source_hash')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Proposition introuvable');
  return data as unknown as BrainProposal & { id: string };
}

/** Approuve une proposition `conversation` ou `entite` → écrit la note. */
export async function approveProposalAction(
  input: z.infer<typeof ApproveSchema>,
): Promise<Result> {
  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const note = applyProposal(proposal, parsed.data.editedBody);
    // On écrit AVANT de marquer approuvée : si l'upsert échoue, la proposition
    // reste `en_attente` et l'admin peut réessayer. Rien n'est perdu.
    const err = await upsertNote(gate.db, note);
    if (err) return { success: false, error: err };
    const moved = await decide(gate.db, parsed.data.id, 'approuvee', gate.userId);
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'approve failed', { error: e });
    return { success: false, error: (e as Error).message };
  }

  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Rejette : rien n'entre dans le cerveau, et le rejet est durable (source_hash). */
export async function rejectProposalAction(
  input: z.infer<typeof RejectSchema>,
): Promise<Result> {
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const moved = await decide(
      gate.db, parsed.data.id, 'rejetee', gate.userId, parsed.data.reason,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Lacune 👎 : la réponse saisie par l'admin devient une note `conversation`. */
export async function resolveGapAction(
  input: z.infer<typeof GapSchema>,
): Promise<Result> {
  const parsed = GapSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Réponse manquante' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const p = proposal.payload as {
      question?: string;
      answer_ko?: string;
      derived_from?: string[];
      source_hashes?: Record<string, string>;
    };
    const note = gapToBrainNote(
      {
        id: proposal.source_ref,
        question: p.question ?? '',
        answer_ko: p.answer_ko ?? '',
      },
      parsed.data.answer,
      p.derived_from ?? [],
      p.source_hashes ?? {},
    );
    const err = await upsertNote(gate.db, note);
    if (err) return { success: false, error: err };
    const moved = await decide(gate.db, parsed.data.id, 'approuvee', gate.userId);
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'resolveGap failed', { error: e });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}

/** Obsolescence : garder (dé-staler) / archiver (supprimer) / régénérer (drapeau). */
export async function arbitrateStaleAction(
  input: z.infer<typeof StaleSchema>,
): Promise<Result> {
  const parsed = StaleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Données invalides' };
  const gate = await adminGate();
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const proposal = await loadPending(gate.db, parsed.data.id);
    const path = proposal.target_path;
    if (!path) return { success: false, error: 'Proposition sans note cible' };

    if (parsed.data.choix === 'garder') {
      const { data: rows, error } = await gate.db
        .from('brain_notes')
        .select('body, frontmatter')
        .eq('path', path)
        .single();
      if (error || !rows) return { success: false, error: 'Note introuvable' };
      const body = String(rows.body).replace(/^> ⚠️[^\n]*\n\n/, '');
      const { error: upErr } = await gate.db
        .from('brain_notes')
        .update({
          body,
          frontmatter: {
            ...(rows.frontmatter as Record<string, unknown>),
            stale: false,
          } as never,
          updated_at: new Date().toISOString(),
        })
        .eq('path', path);
      if (upErr) return { success: false, error: upErr.message };
    } else if (parsed.data.choix === 'archiver') {
      const { error } = await gate.db.from('brain_notes').delete().eq('path', path);
      if (error) return { success: false, error: error.message };
    } else {
      // Régénérer : l'app ne peut pas appeler Claude (abonnement Max). On pose
      // le drapeau ; le prochain `npm run brain:ingest` réanalyse et repropose.
      const { error } = await gate.db
        .from('brain_proposals')
        .update({
          status: 'a_regenerer',
          decided_by: gate.userId,
          decided_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.id)
        .eq('status', 'en_attente');
      if (error) return { success: false, error: error.message };
      revalidatePath('/admin/cerveau', 'layout');
      return { success: true };
    }

    const moved = await decide(
      gate.db, parsed.data.id, 'approuvee', gate.userId, parsed.data.choix,
    );
    if (!moved) return { success: false, error: 'Proposition déjà traitée' };
  } catch (e) {
    logger.error('actions.brain-proposals', 'arbitrateStale failed', { error: e });
    return { success: false, error: (e as Error).message };
  }
  revalidatePath('/admin/cerveau', 'layout');
  return { success: true };
}
```

- [ ] **Étape 2 : vérifier**

Lancer : `npm run typecheck && npm run lint`
Attendu : aucune erreur. Si `checkAuth` ne renvoie pas `role`, relire
`lib/auth/guards.ts` : c'est bien `checkAuth` (et non `requireAuth`) qui expose `role`.

- [ ] **Étape 3 : commit**

```bash
git add lib/actions/brain-proposals.ts
git commit -m "feat(cerveau): actions d'arbitrage des propositions"
```

---

## Task 8 : page `/admin/cerveau`

**Fichiers :**
- Créer : `app/(dashboard)/admin/cerveau/page.tsx`
- Créer : `app/(dashboard)/admin/cerveau/loading.tsx`
- Créer : `app/(dashboard)/admin/cerveau/proposals-review.tsx`

- [ ] **Étape 1 : la page server**

`app/(dashboard)/admin/cerveau/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getPendingProposals } from '@/lib/queries/brain-proposals';
import { PageHeader } from '@/components/shared/page-header';
import { ProposalsReview } from './proposals-review';

export const metadata: Metadata = { title: 'Cerveau - SOLUVIA' };

export default async function AdminCerveauPage() {
  const [user, proposals] = await Promise.all([getUser(), getPendingProposals()]);
  if (!isAdmin(user?.role)) redirect('/accueil');

  return (
    <div>
      <PageHeader
        title="Cerveau"
        description="Ce que le cerveau propose d'apprendre : à valider, corriger ou rejeter avant que ça devienne une connaissance de référence"
      />
      <ProposalsReview proposals={proposals} />
    </div>
  );
}
```

- [ ] **Étape 2 : le loading**

`app/(dashboard)/admin/cerveau/loading.tsx` :

```tsx
export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded bg-muted" />
    </div>
  );
}
```

- [ ] **Étape 3 : le composant de revue**

`app/(dashboard)/admin/cerveau/proposals-review.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProposalRow } from '@/lib/queries/brain-proposals';
import {
  approveProposalAction,
  rejectProposalAction,
  resolveGapAction,
  arbitrateStaleAction,
} from '@/lib/actions/brain-proposals';

const KIND_LABEL: Record<string, string> = {
  conversation: 'Réponses validées 👍',
  lacune: 'Lacunes à combler 👎',
  entite: 'Entités & définitions',
  obsolescence: 'Notes obsolètes',
};
const ORDER = ['lacune', 'conversation', 'entite', 'obsolescence'];

export function ProposalsReview({ proposals }: { proposals: ProposalRow[] }) {
  const { refresh } = useRouter();
  const [selected, setSelected] = useState<ProposalRow | null>(proposals[0] ?? null);
  const [draft, setDraft] = useState('');
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        toast.success(ok);
        setSelected(null);
        setDraft('');
        refresh();
      } else {
        toast.error(res.error ?? 'Échec');
      }
    });

  if (!proposals.length) {
    return (
      <p className="text-muted-foreground">
        Rien à valider. Le cerveau proposera de nouvelles notes au prochain
        <code className="mx-1">npm run brain:ingest</code>.
      </p>
    );
  }

  const payload = (selected?.payload ?? {}) as Record<string, unknown>;
  const noteBody = typeof payload.body === 'string' ? payload.body : '';

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <div className="space-y-6">
        {ORDER.filter((k) => proposals.some((p) => p.kind === k)).map((kind) => (
          <section key={kind}>
            <h2 className="mb-2 text-sm font-semibold">
              {KIND_LABEL[kind]}{' '}
              <Badge variant="secondary">
                {proposals.filter((p) => p.kind === kind).length}
              </Badge>
            </h2>
            <ul className="space-y-1">
              {proposals
                .filter((p) => p.kind === kind)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(p);
                        const b = (p.payload as Record<string, unknown>).body;
                        setDraft(typeof b === 'string' ? b : '');
                      }}
                      className={cn(
                        'w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted',
                        selected?.id === p.id && 'bg-muted font-medium',
                      )}
                    >
                      {String(
                        (p.payload as Record<string, unknown>).title ??
                          (p.payload as Record<string, unknown>).question ??
                          p.target_path ??
                          p.source_ref,
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      {selected && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">
            {selected.target_path ?? selected.source_ref}
          </div>

          {selected.kind === 'lacune' && (
            <>
              <h3 className="font-semibold">{String(payload.question ?? '')}</h3>
              <p className="rounded bg-muted p-3 text-sm text-muted-foreground">
                Réponse jugée insuffisante : {String(payload.answer_ko ?? '')}
              </p>
              <Textarea
                rows={10}
                placeholder="Écris la bonne réponse — elle deviendra une note du cerveau."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={isPending || !draft.trim()}
                  onClick={() =>
                    run(
                      () => resolveGapAction({ id: selected.id, answer: draft }),
                      'Lacune comblée',
                    )
                  }
                >
                  Enregistrer la réponse
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(() => rejectProposalAction({ id: selected.id }), 'Lacune écartée')
                  }
                >
                  Écarter
                </Button>
              </div>
            </>
          )}

          {(selected.kind === 'conversation' || selected.kind === 'entite') && (
            <>
              <h3 className="font-semibold">{String(payload.title ?? '')}</h3>
              <Textarea
                rows={16}
                className="font-mono text-xs"
                value={draft || noteBody}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () =>
                        approveProposalAction({
                          id: selected.id,
                          editedBody: draft !== noteBody ? draft : undefined,
                        }),
                      'Note ajoutée au cerveau',
                    )
                  }
                >
                  Approuver
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(() => rejectProposalAction({ id: selected.id }), 'Proposition rejetée')
                  }
                >
                  Rejeter
                </Button>
              </div>
            </>
          )}

          {selected.kind === 'obsolescence' && (
            <>
              <h3 className="font-semibold">{selected.target_path}</h3>
              <p className="text-sm text-muted-foreground">
                Une source de cette note a changé. Que faire ?
              </p>
              <div className="flex gap-2">
                {(['garder', 'archiver', 'regenerer'] as const).map((choix) => (
                  <Button
                    key={choix}
                    variant={choix === 'garder' ? 'default' : 'outline'}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => arbitrateStaleAction({ id: selected.id, choix }),
                        choix === 'regenerer'
                          ? 'Sera régénérée au prochain brain:ingest'
                          : 'Arbitrage enregistré',
                      )
                    }
                  >
                    {choix === 'garder'
                      ? 'Garder telle quelle'
                      : choix === 'archiver'
                        ? 'Archiver'
                        : 'Régénérer'}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Étape 4 : vérifier**

Lancer : `npm run typecheck && npm run lint`
Attendu : aucune erreur. `components/ui/{button,badge,textarea}.tsx` existent déjà — ne rien
ajouter via la CLI shadcn. Rappel `CLAUDE.md` : shadcn/ui est sur **base-ui, pas radix**
(pas de prop `asChild`).

- [ ] **Étape 5 : commit**

```bash
git add "app/(dashboard)/admin/cerveau"
git commit -m "feat(cerveau): page /admin/cerveau de revue des propositions"
```

---

## Task 9 : lien dans la navigation admin

**Fichiers :**
- Modifier : le composant de navigation qui liste `/admin/syncs` et `/admin/bugs`

- [ ] **Étape 1 : localiser**

Lancer : `grep -rn "admin/bugs" components app --include=*.tsx | grep -v "app/(dashboard)/admin/bugs"`
Attendu : une ou deux occurrences dans la sidebar / le menu admin.

- [ ] **Étape 2 : ajouter l'entrée**

Dans le même tableau que `/admin/bugs`, en suivant exactement la forme des entrées voisines
(icône `lucide-react`, `href`, `label`) :

```tsx
{ href: '/admin/cerveau', label: 'Cerveau', icon: Brain },
```

Ajouter `Brain` à l'import `lucide-react` du fichier.

- [ ] **Étape 3 : vérifier**

Lancer : `npm run typecheck && npm run lint`
Attendu : aucune erreur.

- [ ] **Étape 4 : commit**

```bash
git add -u
git commit -m "feat(cerveau): lien Cerveau dans la navigation admin"
```

---

## Task 10 : un 👎 crée une lacune

**Fichiers :**
- Modifier : `app/api/process/feedback/route.ts`

- [ ] **Étape 1 : modifier la route**

Après le bloc `if (error) { … }` et avant le `return NextResponse.json({ ok: true })`, insérer :

```ts
  // Un 👎 ouvre une lacune dans la file de revue (/admin/cerveau) : c'est là que
  // l'admin écrit la bonne réponse, qui devient une note du cerveau. Insertion
  // via le client admin car la RLS de brain_proposals est admin-only et l'auteur
  // du 👎 ne l'est pas. Best-effort : un échec ici ne doit pas perdre le feedback,
  // le prochain `brain:ingest` rattrape les 👎 sans proposition.
  if (rating === -1) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { createHash } = await import('node:crypto');
      const admin = createAdminClient();
      const { data: fb } = await admin
        .from('process_qa_feedback')
        .select('id')
        .eq('user_id', user.id)
        .eq('question', question)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (fb) {
        await admin.from('brain_proposals').upsert(
          {
            kind: 'lacune',
            status: 'en_attente',
            target_path: null,
            payload: {
              question,
              answer_ko: answer,
              derived_from: [],
              source_hashes: {},
            } as never,
            source_ref: fb.id,
            source_hash: createHash('sha256')
              .update(`${question}|${answer}`)
              .digest('hex'),
          },
          { onConflict: 'kind,source_ref' },
        );
      }
    } catch (e) {
      logger.error('process/feedback', 'Ouverture de la lacune échouée', {
        error: e,
      });
    }
  }
```

- [ ] **Étape 2 : vérifier**

Lancer : `npm run typecheck && npm run lint`
Attendu : aucune erreur.

- [ ] **Étape 3 : commit**

```bash
git add app/api/process/feedback/route.ts
git commit -m "feat(cerveau): un 👎 ouvre une lacune a arbitrer"
```

---

## Task 11 : le script propose au lieu d'écrire

C'est le basculement : les trois fonctions Phase 3 de `scripts/brain-ingest.ts` cessent
d'écrire dans `brain_notes`.

**Fichiers :**
- Modifier : `scripts/brain-ingest.ts`

- [ ] **Étape 1 : ajouter les helpers de proposition**

Après la fonction `upsertNote` (≈ ligne 76), ajouter :

```ts
import { shouldPropose, noteToProposal, type BrainProposal } from '../lib/brain/proposal';

// Nom distinct de `ProposalRow` (lib/queries/brain-proposals.ts), qui porte la
// ligne complète pour l'UI : ici on ne lit que de quoi décider.
interface ProposalState {
  kind: string;
  source_ref: string;
  status: 'en_attente' | 'approuvee' | 'rejetee' | 'a_regenerer';
  source_hash: string;
}

/** État des propositions déjà en base, indexé par `kind:source_ref`. */
async function loadProposals(): Promise<Map<string, ProposalState>> {
  const rows = await pg<ProposalState>(
    `select kind, source_ref, status, source_hash from public.brain_proposals`,
  );
  return new Map(rows.map((r) => [`${r.kind}:${r.source_ref}`, r]));
}

/**
 * Dépose (ou rouvre) une proposition. Renvoie true si quelque chose a été écrit.
 * `shouldPropose` garantit qu'un rejet reste durable tant que le contenu ne bouge pas.
 */
async function proposeNote(
  p: BrainProposal,
  known: Map<string, ProposalState>,
  dryRun: boolean,
): Promise<boolean> {
  const existing = known.get(`${p.kind}:${p.source_ref}`) ?? null;
  const verdict = shouldPropose(p, existing);
  if (verdict === 'skip') return false;
  if (dryRun) {
    console.log(`  proposition (${verdict}) ${p.kind} : ${p.target_path ?? p.source_ref}`);
    return true;
  }
  await pg(`insert into public.brain_proposals
    (kind, status, target_path, payload, source_ref, source_hash)
    values (${lit(p.kind)}, 'en_attente', ${p.target_path ? lit(p.target_path) : 'null'},
            ${lit(JSON.stringify(p.payload))}::jsonb, ${lit(p.source_ref)}, ${lit(p.source_hash)})
    on conflict (kind, source_ref) do update set
      status = 'en_attente',
      target_path = excluded.target_path,
      payload = excluded.payload,
      source_hash = excluded.source_hash,
      reason = null,
      decided_by = null,
      decided_at = null;`);
  return true;
}
```

- [ ] **Étape 2 : `ingestConversations` propose**

Dans `ingestConversations`, charger l'état des propositions en tête de fonction
(`const known = await loadProposals();`), puis remplacer le bloc

```ts
    if (dryRun) {
      console.log(`conversation À CAPITALISER : ${f.question.slice(0, 60)}`);
      n++;
      continue;
    }
    await upsertNote(
      conversationToBrainNote(...),
    );
    console.log(`  ✓ conversation « ${f.question.slice(0, 50)} »`);
    n++;
```

par

```ts
    const note = conversationToBrainNote(
      { id: f.id, question: f.question, answer: f.answer },
      derivedFrom,
      qaHash,
      sourceHashes,
    );
    if (await proposeNote(noteToProposal(note), known, dryRun)) n++;
```

Supprimer aussi le court-circuit `if (seen.get(f.id) === qaHash) continue;` : l'idempotence
est désormais portée par `shouldPropose` face à `brain_proposals` (une conversation non encore
approuvée n'est PAS dans `brain_notes`, donc `seen` ne la connaît pas et elle serait reproposée
à chaque run).

- [ ] **Étape 3 : `ingestEntities` propose, et son hash cesse de suivre les backlinks**

Même transformation : `const known = await loadProposals();` en tête, et remplacer
`await upsertNote(entityToBrainNote(...)); n++;` par

```ts
    const note = entityToBrainNote(short, d.name || titleCase(short), bl, d.definition ?? '', hash);
    if (await proposeNote(noteToProposal(note), known, dryRun)) n++;
```

**Et corriger le calcul de `hash` juste au-dessus.** Il vaut aujourd'hui
`createHash('sha256').update(`${bl.join(',')}|${d.definition}`)` — il inclut les backlinks.
Or les backlinks bougent dès qu'une note quelconque se met à citer l'entité, ce qui ferait
changer le hash sans que rien de ce que l'admin a arbitré n'ait changé : une entité rejetée
réapparaîtrait dans la file quelques runs plus tard, avec la même définition. Le rejet ne
serait durable que pour les conversations. Le hash ne doit porter que **la partie arbitrée** :

```ts
    // Le hash ne porte que ce que l'admin arbitre (nom + définition). Les backlinks
    // sont dérivés mécaniquement du graphe et bougent tout le temps : les inclure
    // ferait réapparaître une entité rejetée dès qu'une nouvelle note la cite.
    const hash = createHash('sha256')
      .update(`${d.name || titleCase(short)}|${d.definition ?? ''}`)
      .digest('hex');
```

Conséquence assumée : la section « Notes liées » d'une entité **déjà approuvée** ne se met plus
à jour toute seule quand le graphe bouge. Ce n'est pas bloquant (l'expansion de recherche
s'appuie sur `links` des notes sources, pas sur cette section), et c'est à traiter séparément
si ça gêne à l'usage.

- [ ] **Étape 4 : `markStaleConversations` propose au lieu de modifier**

Remplacer le corps de la boucle qui fait l'`update … set frontmatter … body …` par une
proposition d'arbitrage (la note reste marquée `stale` en base — c'est ce qui l'exclut de la
recherche — mais l'arbitrage passe par la file) :

```ts
    if (!stale || already) continue;
    const marker = '> ⚠️ Réponse à revoir : une source a changé.\n\n';
    if (!dryRun) {
      await pg(
        `update public.brain_notes set
           frontmatter = frontmatter || '{"stale":true}'::jsonb,
           body = ${lit(marker + note.body)},
           updated_at = now()
         where path = ${lit(note.path)};`,
      );
    }
    const changed = Object.keys(note.frontmatter?.source_hashes ?? {});
    await proposeNote(
      {
        kind: 'obsolescence',
        target_path: note.path,
        payload: { path: note.path, title: note.title, sources_modifiees: changed },
        source_ref: note.path,
        source_hash: createHash('sha256').update(JSON.stringify(sh)).digest('hex'),
      },
      known,
      dryRun,
    );
    n++;
```

avec `const known = await loadProposals();` en tête de fonction.

- [ ] **Étape 5 : consommer les `a_regenerer`**

Dans `main`, **avant** le bloc Phase 3 (et non après), ajouter le code ci-dessous.

L'ordre compte : ces demandes doivent être consommées avant que les fonctions Phase 3 ne
touchent aux propositions. `shouldPropose` protège déjà les lignes `a_regenerer` (elle renvoie
`skip` même sur hash changé, précisément pour ne pas écraser la demande d'un admin), mais
consommer d'abord évite de faire reposer la correction sur une seule ligne de garde : la
réanalyse a lieu, puis les propositions rafraîchies repassent normalement par la file.

```ts
  // Régénérations demandées depuis /admin/cerveau : l'app ne peut pas appeler
  // Claude, c'est ici qu'on refait l'analyse et qu'on repropose.
  const aRegenerer = await pg<{ id: string; target_path: string }>(
    `select id, target_path from public.brain_proposals
     where status = 'a_regenerer' and target_path is not null`,
  );
  for (const r of aRegenerer) {
    console.log(`régénération demandée : ${r.target_path}`);
    if (dryRun) continue;
    // La note repart du cycle normal : on efface son hash pour forcer la
    // réanalyse de la source au prochain passage, et on referme la demande.
    await pg(`update public.brain_notes set source_hash = null
              where path = ${lit(r.target_path)};`);
    await pg(`update public.brain_proposals set status = 'approuvee',
              reason = 'régénérée', decided_at = now() where id = ${lit(r.id)};`);
  }
  console.log(`Régénérations traitées : ${aRegenerer.length}`);
```

- [ ] **Étape 6 : rattraper les 👎 sans proposition + assainir `_lacunes.md`**

Si l'ouverture de la lacune a échoué côté app (Task 10, best-effort), le script rattrape.
Et `_lacunes.md` ne doit plus lister que les lacunes **encore ouvertes**, sinon le coffre
affiche éternellement des trous déjà comblés.

Remplacer entièrement `writeGapsReport` par :

```ts
/**
 * Ouvre les lacunes (👎) manquantes — rattrapage des échecs best-effort de la
 * route feedback — et écrit le rapport des lacunes ENCORE OUVERTES dans le coffre
 * (hors brain_notes → pas de bruit en recherche).
 */
async function syncGaps(vaultDir: string | null, dryRun: boolean): Promise<number> {
  const known = await loadProposals();
  const gaps = await pg<{ id: string; question: string; answer: string }>(
    `select id, question, answer from public.process_qa_feedback where rating = -1`,
  );
  for (const g of gaps) {
    await proposeNote(
      {
        kind: 'lacune',
        target_path: null,
        payload: {
          question: g.question,
          answer_ko: g.answer,
          derived_from: [],
          source_hashes: {},
        },
        source_ref: g.id,
        source_hash: createHash('sha256')
          .update(`${g.question}|${g.answer}`)
          .digest('hex'),
      },
      known,
      dryRun,
    );
  }

  const open = await pg<{ source_ref: string }>(
    `select source_ref from public.brain_proposals
     where kind = 'lacune' and status = 'en_attente'`,
  );
  const openIds = new Set(open.map((o) => o.source_ref));
  const encore = gaps.filter((g) => openIds.has(g.id));

  if (vaultDir && !dryRun) {
    const lines = [
      '# Lacunes du cerveau (retours 👎)',
      '',
      'Questions encore sans réponse satisfaisante — à combler depuis /admin/cerveau.',
      '',
    ];
    for (const g of encore)
      lines.push(
        `- **${g.question}**\n  > ${g.answer.replace(/\n/g, ' ').slice(0, 200)}`,
      );
    if (!encore.length) lines.push('_(aucune pour l\'instant)_');
    writeFileSync(join(vaultDir, '_lacunes.md'), `${lines.join('\n')}\n`, 'utf8');
  }
  return encore.length;
}
```

Puis, dans `main`, remplacer l'appel à `writeGapsReport(vaultDir)` par
`await syncGaps(vaultDir, dryRun)` — en le sortant de l'éventuel `if (vaultDir)` qui
l'entoure, puisque le rattrapage doit tourner même sans coffre. Adapter le message de log
existant en `Lacunes ouvertes : ${gaps} question(s).`

- [ ] **Étape 7 : vérifier en dry-run**

Lancer : `npm run typecheck && npm run brain:ingest:dry`
Attendu : la sortie annonce des `proposition (insert) …` au lieu de `✓ conversation …`,
et **aucune** écriture dans `brain_notes` pour les types dérivés. Relancer une deuxième fois :
attendu — 0 proposition (tout est `skip`), ce qui prouve l'idempotence.

- [ ] **Étape 8 : commit**

```bash
git add scripts/brain-ingest.ts
git commit -m "feat(cerveau): le script propose au lieu d'ecrire les notes derivees"
```

---

## Task 12 : vérification de bout en bout

- [ ] **Étape 1 : suite complète**

Lancer : `npx vitest run __tests__/brain-*.test.ts && npm run typecheck && npm run lint && npm run build`
Attendu : tout PASS, build OK.

- [ ] **Étape 2 : parcours réel**

1. `npm run brain:ingest` (sur la machine avec `claude` authentifié Max) → propositions créées.
2. `npm run dev`, ouvrir `/admin/cerveau` en admin → les propositions apparaissent groupées.
3. Approuver une `conversation` → vérifier qu'elle est dans `brain_notes` (`select path from
   public.brain_notes order by updated_at desc limit 3` via le script `prod-sql.mjs`).
4. Rejeter une `entite`, relancer `npm run brain:ingest:dry` → elle **ne doit pas** réapparaître.
5. Poser une question en 👎 dans l'assistant → une lacune apparaît dans `/admin/cerveau` ;
   y répondre → la note est créée et l'assistant la ressort à la même question.
6. Ouvrir `/admin/cerveau` avec un compte non-admin → redirection vers `/accueil`.

- [ ] **Étape 3 : régénérer le coffre**

Lancer : `npm run brain:vault -- ~/soluvia-cerveau`
Attendu : le coffre ne contient que des notes approuvées.

- [ ] **Étape 4 : ouvrir la PR**

```bash
git push -u origin feat/cerveau-semi-auto
gh pr create --title "Cerveau semi-automatique : le cerveau propose, l'admin valide" \
  --body "Voir docs/plans/2026-08-05-cerveau-semi-auto-design.md"
```
