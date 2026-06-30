# Projet libre — Rattachement automatique des factures orphelines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etablir l'invariant « aucune facture sans projet » : toute facture libre / issue de devis / orpheline historique est rattachee a un vrai projet « libre » (un par client), puis `factures.projet_id` est verrouille `NOT NULL`.

**Architecture:** Un flag `projets.est_libre` (modele d'`est_interne`) + un index unique partiel `(client_id) WHERE est_libre` (un par client). Une fonction SQL `get_or_create_projet_libre(client_id)` est la **source unique** de la logique find-or-create, appelee au runtime (RPC depuis les server actions) et par la migration de backfill. Le backfill neutralise temporairement le trigger de gel post-emission, puis la colonne est verrouillee.

**Tech Stack:** Next.js 16 / TypeScript, Supabase (migrations SQL + types generes + pgTAP), Vitest, Zod.

**Spec de reference :** `docs/superpowers/specs/2026-06-29-projet-libre-design.md` (sections 1 a 6 ; la section 7 « analytique » est HORS PERIMETRE de ce plan).

**Conventions projet :** UI/PDF en francais, apostrophes droites, pas d'em-dash dans les chaines. `npm test` doit rester vert (hook pre-push). pgTAP via `npx supabase test db`. Travailler sur la branche `feat/projet-libre`. Commits conventionnels `feat(projet-libre): ...`.

**Decisions appliquees (cf. spec) :** `taux_commission = 0` ; `code_analytique` NON copie (reste NULL) ; verrou `NOT NULL` sur `projet_id` UNIQUEMENT ; trigger de gel : Option A (DISABLE/ENABLE local autour du backfill).

---

## File Structure

| Fichier                                                                         | Responsabilite                                                                                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260630120000_projets_libre.sql`                          | Colonne `est_libre`, CHECK exclusivite, index unique partiel, typologie `LIB`, fonction `get_or_create_projet_libre` |
| `supabase/migrations/20260630120500_factures_backfill_projet_libre_notnull.sql` | Backfill des factures orphelines + verrou `NOT NULL`                                                                 |
| `types/database.ts`                                                             | Regenere (expose `est_libre` + la Function RPC)                                                                      |
| `supabase/tests/20_projet_libre.sql`                                            | pgTAP : fonction find-or-create, idempotence, index unique, CHECK exclusivite                                        |
| `supabase/tests/21_factures_projet_libre.sql`                                   | pgTAP : verrou NOT NULL, visibilite RLS (CDP), backfill malgre trigger de gel                                        |
| `lib/projets/projet-libre.ts`                                                   | Helper runtime (wrapper RPC `getOrCreateProjetLibre`)                                                                |
| `__tests__/projet-libre-helper.test.ts`                                         | Test du wrapper RPC                                                                                                  |
| `lib/actions/factures/brouillon-libre.ts`                                       | `createFreeBrouillon` rattache au projet libre                                                                       |
| `__tests__/create-free-brouillon.test.ts`                                       | Mise a jour : assert `projet_id` = projet libre                                                                      |
| `lib/actions/devis-to-facture.ts`                                               | `createFactureFromDevis` ecrit `projet_id` = projet libre du client                                                  |
| `__tests__/devis-to-facture-projet-libre.test.ts`                               | Test du rattachement devis                                                                                           |
| `lib/queries/factures.ts`                                                       | `listProjetsForFacturation` exclut `est_libre`                                                                       |
| `lib/queries/projets.ts`                                                        | `getProjetsList` exclut `est_libre`                                                                                  |
| `components/projets/projet-create-dialog.tsx`                                   | Masque la typologie `LIB` du dropdown                                                                                |

---

## Task 1: Migration schema + fonction `get_or_create_projet_libre`

**Files:**

- Create: `supabase/migrations/20260630120000_projets_libre.sql`
- Create: `supabase/tests/20_projet_libre.sql`
- Modify: `types/database.ts` (regenere)

- [ ] **Step 1: Ecrire le test pgTAP (echoue : objets absents)**

Create `supabase/tests/20_projet_libre.sql`:

```sql
-- ===========================================================================
-- Test : get_or_create_projet_libre + invariants du projet libre
-- ===========================================================================
-- Migration : 20260630120000_projets_libre.sql
-- Spec : docs/superpowers/specs/2026-06-29-projet-libre-design.md (sections 1-2)

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(9);

CREATE TEMP TABLE _ctx (client_id UUID);
INSERT INTO _ctx (client_id) VALUES (gen_random_uuid());
INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Projet Libre', 'TLB', false, false FROM _ctx;

-- Premier appel : cree
CREATE TEMP TABLE _r (id1 UUID, id2 UUID);
INSERT INTO _r (id1) SELECT get_or_create_projet_libre((SELECT client_id FROM _ctx));

SELECT isnt((SELECT id1 FROM _r), NULL, 'Premier appel cree un projet libre (id non null)');

SELECT is(
  (SELECT est_libre FROM projets WHERE id = (SELECT id1 FROM _r)),
  true, 'Le projet cree a est_libre = true');

SELECT is(
  (SELECT taux_commission FROM projets WHERE id = (SELECT id1 FROM _r)),
  0::numeric(5,2), 'taux_commission = 0 (aligne est_interne, pas de partage)');

SELECT is(
  (SELECT cdp_id FROM projets WHERE id = (SELECT id1 FROM _r)),
  NULL, 'cdp_id NULL (admin-only)');

SELECT is(
  (SELECT t.code FROM projets p JOIN typologies_projet t ON t.id = p.typologie_id
   WHERE p.id = (SELECT id1 FROM _r)),
  'LIB', 'typologie LIB');

SELECT matches(
  (SELECT ref FROM projets WHERE id = (SELECT id1 FROM _r)),
  '^[0-9]{4}-TLB-LIB$', 'ref auto-genere NNNN-TLB-LIB');

-- Deuxieme appel : reutilise (idempotent)
UPDATE _r SET id2 = get_or_create_projet_libre((SELECT client_id FROM _ctx));
SELECT is((SELECT id1 FROM _r), (SELECT id2 FROM _r),
  'Deuxieme appel reutilise le meme projet (idempotent)');

-- Un seul projet libre par client (index unique partiel)
SELECT throws_ok($$
  INSERT INTO projets (client_id, typologie_id, est_libre, statut, archive, taux_commission)
  SELECT client_id, (SELECT id FROM typologies_projet WHERE code='LIB'), true, 'actif', false, 0
  FROM _ctx
$$, '23505', NULL, 'Deuxieme projet libre direct pour le meme client : unique_violation');

-- Exclusivite est_interne / est_libre (CHECK)
SELECT throws_ok($$
  UPDATE projets SET est_libre = true WHERE ref = '9001-INT-FOR'
$$, '23514', NULL, 'est_interne + est_libre simultanes : check_violation');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer le test pour le voir echouer**

Run: `npx supabase test db`
Expected: `20_projet_libre.sql` echoue (`function get_or_create_projet_libre(uuid) does not exist` / `column est_libre does not exist`).

- [ ] **Step 3: Ecrire la migration**

Create `supabase/migrations/20260630120000_projets_libre.sql`:

```sql
-- Projet libre : rattachement automatique des factures orphelines (libres,
-- issues de devis, avoirs historiques) a un vrai projet, un par client, pour
-- etablir l'invariant "aucune facture sans projet". Modele calque sur
-- est_interne (20260428103623_projets_internes.sql).

-- 1. Flag est_libre + exclusivite avec est_interne.
ALTER TABLE projets ADD COLUMN est_libre BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projets ADD CONSTRAINT chk_libre_interne_exclusifs
  CHECK (NOT (est_interne AND est_libre));

COMMENT ON COLUMN projets.est_libre IS
  'TRUE = projet libre systeme (un par client) portant les factures sans projet metier. Exclu des listings/KPI/pickers, cdp_id NULL (admin-only).';

-- 2. Un seul projet libre par client (idempotence + garde anti-concurrence).
CREATE UNIQUE INDEX uq_projet_libre_par_client
  ON projets (client_id) WHERE est_libre;

-- 3. Typologie dediee 'LIB' : le trigger generate_projet_ref produit
--    NNNN-TRI-LIB. ON CONFLICT (code) pour idempotence (re-run / db reset).
INSERT INTO typologies_projet (id, code, libelle, actif)
VALUES ('00000000-0000-0000-0000-00000000bbff', 'LIB', 'Libre', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Source UNIQUE de la logique find-or-create, partagee runtime (RPC) +
--    backfill. SECURITY INVOKER : un appel RPC direct par un non-admin echoue
--    a l'INSERT via la RLS projets_admin_insert (pas d'escalade de privilege).
CREATE OR REPLACE FUNCTION get_or_create_projet_libre(p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projet_id uuid;
  v_typologie uuid;
BEGIN
  -- Find : predicat IDENTIQUE a l'index unique (WHERE est_libre, sans archive).
  SELECT id INTO v_projet_id
  FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  IF FOUND THEN RETURN v_projet_id; END IF;

  SELECT id INTO v_typologie FROM typologies_projet WHERE code = 'LIB';

  INSERT INTO projets (client_id, typologie_id, est_libre, statut, archive, taux_commission, cdp_id)
  VALUES (p_client_id, v_typologie, true, 'actif', false, 0, NULL)
  ON CONFLICT (client_id) WHERE est_libre DO NOTHING
  RETURNING id INTO v_projet_id;

  IF v_projet_id IS NULL THEN
    -- Course concurrente perdue : l'autre insert a gagne, on relit.
    SELECT id INTO v_projet_id
    FROM projets WHERE client_id = p_client_id AND est_libre LIMIT 1;
  END IF;

  RETURN v_projet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION get_or_create_projet_libre(uuid) TO authenticated;
```

- [ ] **Step 4: Appliquer la migration en local**

Run: `npx supabase db push`
Expected: `Applying migration 20260630120000_projets_libre.sql...` sans erreur.

- [ ] **Step 5: Regenerer les types**

Run: `npx supabase gen types typescript --local > types/database.ts`
Verifier qu'`est_libre` apparait sur `projets` et que la Function `get_or_create_projet_libre` est exposee :

Run: `grep -n "get_or_create_projet_libre" types/database.ts`
Expected: au moins une occurrence (sous `Functions`).

Garde-fou anti-drift (aucune colonne supprimee) :
Run: `git diff types/database.ts | grep -E '^\-' | grep -v est_libre | grep -v get_or_create_projet_libre | grep -v '^---'`
Expected: sortie vide.

- [ ] **Step 6: Relancer le test pgTAP (passe)**

Run: `npx supabase test db`
Expected: `20_projet_libre.sql` ... `ok` (9/9).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260630120000_projets_libre.sql supabase/tests/20_projet_libre.sql types/database.ts
git commit -m "feat(projet-libre): schema est_libre + fonction get_or_create_projet_libre"
```

---

## Task 2: Helper runtime `getOrCreateProjetLibre`

**Files:**

- Create: `lib/projets/projet-libre.ts`
- Test: `__tests__/projet-libre-helper.test.ts`

- [ ] **Step 1: Ecrire le test (echoue : module absent)**

Create `__tests__/projet-libre-helper.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateProjetLibre } from '@/lib/projets/projet-libre';

function fakeSupabase(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) };
}

describe('getOrCreateProjetLibre', () => {
  it('retourne le projetId renvoye par la RPC', async () => {
    const sb = fakeSupabase({ data: 'projet-libre-id', error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOrCreateProjetLibre(sb as any, 'client-1');
    expect(r).toEqual({ ok: true, projetId: 'projet-libre-id' });
    expect(sb.rpc).toHaveBeenCalledWith('get_or_create_projet_libre', {
      p_client_id: 'client-1',
    });
  });

  it('remonte une erreur si la RPC echoue', async () => {
    const sb = fakeSupabase({ data: null, error: { message: 'boom' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOrCreateProjetLibre(sb as any, 'client-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boom/);
  });

  it('remonte une erreur si data est null sans erreur', async () => {
    const sb = fakeSupabase({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOrCreateProjetLibre(sb as any, 'client-1');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour le voir echouer**

Run: `npm test -- projet-libre-helper`
Expected: FAIL (`Cannot find module '@/lib/projets/projet-libre'`).

- [ ] **Step 3: Ecrire le helper**

Create `lib/projets/projet-libre.ts`:

```ts
import type { SupabaseServerClient } from '@/lib/actions/factures/brouillons-shared';

// Wrapper fin sur la RPC get_or_create_projet_libre (source unique cote SQL).
// Find-or-create idempotent : renvoie l'id du projet libre du client, en le
// creant a la volee si absent. La concurrence est geree en base (index unique
// partiel + ON CONFLICT). Admin-only : l'INSERT cote SQL est soumis a la RLS
// projets_admin_insert.
export async function getOrCreateProjetLibre(
  supabase: SupabaseServerClient,
  clientId: string,
): Promise<{ ok: true; projetId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_or_create_projet_libre', {
    p_client_id: clientId,
  });
  if (error || data == null) {
    return {
      ok: false,
      error: error?.message ?? 'Projet libre indisponible',
    };
  }
  return { ok: true, projetId: data as string };
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npm test -- projet-libre-helper`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add lib/projets/projet-libre.ts __tests__/projet-libre-helper.test.ts
git commit -m "feat(projet-libre): helper runtime getOrCreateProjetLibre (wrapper RPC)"
```

---

## Task 3: Brancher la facture libre

**Files:**

- Modify: `lib/actions/factures/brouillon-libre.ts:1-16` (import), `:295-300` (appel helper + projetId)
- Modify: `__tests__/create-free-brouillon.test.ts:74-130` (mock rpc), `:248-268` (assertion)

- [ ] **Step 1: Mettre a jour le test existant (echoue)**

Dans `__tests__/create-free-brouillon.test.ts`, ajouter le recorder RPC sous `recordedInserts` (apres la ligne 72) :

```ts
const recordedRpc: Array<{ fn: string; args: unknown }> = [];
```

Ajouter la methode `rpc` dans `buildSupabase()` (juste avant la fermeture `};` de l'objet retourne, apres le bloc `delete()`), de sorte que le helper recoive l'id du projet libre :

```ts
      };
    },
    rpc(fn: string, args: unknown) {
      recordedRpc.push({ fn, args });
      return Promise.resolve({ data: 'projet-libre-id', error: null });
    },
  };
}
```

Reinitialiser le recorder dans `beforeEach` (apres `recordedInserts.length = 0;`) :

```ts
recordedRpc.length = 0;
```

Remplacer le test `'insère la facture avec projet_id=NULL, statut=a_emettre, sans ref'` (lignes 248-268) par :

```ts
it('rattache la facture au projet libre du client (projet_id non null)', async () => {
  const { createFreeBrouillon } =
    await import('@/lib/actions/factures/brouillons');
  const result = await createFreeBrouillon({
    clientId: VALID_CLIENT_UUID,
    lignes: [{ description: 'Audit', montantHt: 1000 }],
  });
  expect(result.success).toBe(true);
  expect(result.id).toBe('fac-new-id');

  expect(recordedRpc[0]).toEqual({
    fn: 'get_or_create_projet_libre',
    args: { p_client_id: VALID_CLIENT_UUID },
  });

  const factureInsert = recordedInserts.find((i) => i.table === 'factures');
  expect(factureInsert).toBeDefined();
  const payload = factureInsert!.payload as Record<string, unknown>;
  expect(payload.projet_id).toBe('projet-libre-id');
  expect(payload.client_id).toBe(VALID_CLIENT_UUID);
  expect(payload.statut).toBe('a_emettre');
  expect(payload.est_avoir).toBe(false);
  expect(payload.ref).toBeUndefined();
  expect(payload.numero_seq).toBeUndefined();
  expect(payload.created_by).toBe(VALID_USER_UUID);
});
```

- [ ] **Step 2: Lancer le test pour le voir echouer**

Run: `npm test -- create-free-brouillon`
Expected: FAIL (`payload.projet_id` vaut `null`, et `recordedRpc[0]` est `undefined`).

- [ ] **Step 3: Brancher le helper dans `createFreeBrouillon`**

Dans `lib/actions/factures/brouillon-libre.ts`, ajouter l'import (apres les imports existants, vers la ligne 16) :

```ts
import { getOrCreateProjetLibre } from '@/lib/projets/projet-libre';
```

Dans `createFreeBrouillon`, juste apres le bloc de garde client archive (ligne 295, avant `const result = await insertBrouillonWithLignes({`), inserer :

```ts
// Invariant "aucune facture sans projet" : rattache la facture libre au
// projet libre du client (cree a la volee si absent). Admin-only deja
// garanti par checkAuth ci-dessus -> l'INSERT du projet passe la RLS.
const projetLibre = await getOrCreateProjetLibre(supabase, clientId);
if (!projetLibre.ok) return { success: false, error: projetLibre.error };
```

Remplacer `projetId: null,` (ligne 300) par :

```ts
    projetId: projetLibre.projetId,
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npm test -- create-free-brouillon`
Expected: PASS (toutes les assertions, dont le rattachement projet libre).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/factures/brouillon-libre.ts __tests__/create-free-brouillon.test.ts
git commit -m "feat(projet-libre): factures libres rattachees au projet libre du client"
```

---

## Task 4: Brancher la facture depuis devis

**Files:**

- Modify: `lib/actions/devis-to-facture.ts:3-12` (import), `:63` (appel helper), `:141-156` (projet_id)
- Test: `__tests__/devis-to-facture-projet-libre.test.ts`

- [ ] **Step 1: Ecrire le test (echoue)**

Create `__tests__/devis-to-facture-projet-libre.test.ts`:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_DEVIS_UUID = '33333333-3333-4333-8333-333333333333';
const VALID_CLIENT_UUID = '11111111-1111-4111-8111-111111111111';

const recordedInserts: Array<{ table: string; payload: unknown }> = [];
const recordedRpc: Array<{ fn: string; args: unknown }> = [];

function buildSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          // .from('factures').select('montant_ht').eq('devis_id', id)
          return { eq: () => Promise.resolve({ data: [], error: null }) };
        },
        insert(payload: unknown) {
          recordedInserts.push({ table, payload });
          if (table === 'factures') {
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'fac-devis-id' },
                    error: null,
                  }),
              }),
            };
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    rpc(fn: string, args: unknown) {
      recordedRpc.push({ fn, args });
      return Promise.resolve({ data: 'projet-libre-id', error: null });
    },
  };
}

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => buildSupabase()),
}));
vi.mock('@/lib/queries/users', () => ({
  getUser: vi.fn(async () => ({ id: 'admin-1', role: 'admin' })),
}));
vi.mock('@/lib/queries/parametres', () => ({
  getDelaiEcheanceJours: vi.fn(async () => 30),
}));
vi.mock('@/lib/queries/devis', () => ({
  getDevisById: vi.fn(async () => ({
    id: VALID_DEVIS_UUID,
    client_id: VALID_CLIENT_UUID,
    societe_emettrice_id: 'soc-1',
    statut: 'accepte',
    montant_ht: 1000,
    ref: 'DEV-001',
    objet: 'Prestation conseil',
    conditions_reglement: '30 jours',
    lignes: [
      {
        libelle: 'Conseil',
        description: '',
        taux_tva: 20,
        total_ht: 1000,
      },
    ],
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  recordedInserts.length = 0;
  recordedRpc.length = 0;
});

describe('createFactureFromDevis - rattachement projet libre', () => {
  it('rattache la facture au projet libre du client du devis', async () => {
    const { createFactureFromDevis } =
      await import('@/lib/actions/devis-to-facture');
    const r = await createFactureFromDevis({
      devisId: VALID_DEVIS_UUID,
      mode: 'solde',
    });
    expect(r.success).toBe(true);

    expect(recordedRpc[0]).toEqual({
      fn: 'get_or_create_projet_libre',
      args: { p_client_id: VALID_CLIENT_UUID },
    });

    const factureInsert = recordedInserts.find((i) => i.table === 'factures');
    expect(factureInsert).toBeDefined();
    const payload = factureInsert!.payload as Record<string, unknown>;
    expect(payload.projet_id).toBe('projet-libre-id');
    expect(payload.client_id).toBe(VALID_CLIENT_UUID);
  });
});
```

- [ ] **Step 2: Lancer le test pour le voir echouer**

Run: `npm test -- devis-to-facture-projet-libre`
Expected: FAIL (`payload.projet_id` est `undefined`, `recordedRpc[0]` est `undefined`).

- [ ] **Step 3: Brancher le helper dans `createFactureFromDevis`**

Dans `lib/actions/devis-to-facture.ts`, ajouter l'import (apres la ligne 12) :

```ts
import { getOrCreateProjetLibre } from '@/lib/projets/projet-libre';
```

Juste apres `const supabase = await createClient();` (ligne 63), inserer :

```ts
// Invariant "aucune facture sans projet" : la table devis n'a pas de lien
// projet -> on rattache au projet libre du client du devis.
const projetLibre = await getOrCreateProjetLibre(supabase, devis.client_id);
if (!projetLibre.ok) return { success: false, error: projetLibre.error };
```

Dans l'objet d'insert facture (lignes 141-156), ajouter le champ `projet_id` (par exemple juste apres `client_id: devis.client_id,` ligne 142) :

```ts
      projet_id: projetLibre.projetId,
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npm test -- devis-to-facture-projet-libre`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/devis-to-facture.ts __tests__/devis-to-facture-projet-libre.test.ts
git commit -m "feat(projet-libre): factures issues de devis rattachees au projet libre"
```

---

## Task 5: Exclure les projets libres des pickers et listings

**Files:**

- Modify: `lib/queries/factures.ts:171-181` (`listProjetsForFacturation`)
- Modify: `lib/queries/projets.ts:42` (`getProjetsList`)

**Note :** Filtrage cote serveur (le projet libre n'arrive jamais dans la page projets ni dans le selecteur « Nouvelle facture »). `listBillableProjets` n'est pas touche : il exige deja au moins un contrat, qu'un projet libre n'a pas. Ces deux requetes sont Supabase-backed : la verif automatisee est le typecheck + le smoke manuel ci-dessous (les invariants DB durs sont couverts par les tests pgTAP des Tasks 1 et 7).

- [ ] **Step 1: Exclure `est_libre` du selecteur de facturation**

Dans `lib/queries/factures.ts`, fonction `listProjetsForFacturation`, ajouter `.eq('est_libre', false)` juste apres `.eq('archive', false)` (ligne 180) :

```ts
    .eq('client.archive', false)
    .eq('archive', false)
    .eq('est_libre', false)
    .order('ref');
```

- [ ] **Step 2: Exclure `est_libre` de la liste des projets**

Dans `lib/queries/projets.ts`, fonction `getProjetsList`, ajouter `.eq('est_libre', false)` juste apres `.eq('archive', false)` (ligne 42) :

```ts
    .eq('archive', false)
    .eq('est_libre', false)
    .order('ref', { ascending: true });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur sur `lib/queries/factures.ts` ni `lib/queries/projets.ts`.

- [ ] **Step 4: Smoke manuel (note d'execution, non bloquant pour le commit)**

Apres `npx supabase db push` et avec un projet libre seede (ou cree via une facture libre), demarrer `npm run dev` puis verifier :

- `/projets` : le projet libre n'apparait pas dans la table.
- Modale « Nouvelle facture » (from-scratch) : le projet libre n'est pas selectionnable.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/factures.ts lib/queries/projets.ts
git commit -m "feat(projet-libre): exclure les projets libres des pickers et de la liste projets"
```

---

## Task 6: Masquer la typologie `LIB` du dropdown de creation de projet

**Files:**

- Modify: `components/projets/projet-create-dialog.tsx:118`

- [ ] **Step 1: Etendre le filtre de typologies actives**

Dans `components/projets/projet-create-dialog.tsx`, remplacer la ligne 118 :

```ts
// Filter active typologies (exclude ABS et LIB systeme)
const activeTypologies = typologies.filter(
  (t) => t.code !== 'ABS' && t.code !== 'LIB',
);
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint -- components/projets/projet-create-dialog.tsx`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add components/projets/projet-create-dialog.tsx
git commit -m "feat(projet-libre): masquer la typologie LIB du dropdown de creation de projet"
```

---

## Task 7: Migration backfill + verrou NOT NULL

**Files:**

- Create: `supabase/migrations/20260630120500_factures_backfill_projet_libre_notnull.sql`
- Create: `supabase/tests/21_factures_projet_libre.sql`

**Pre-requis prod (a faire AVANT d'appliquer en prod, hors plan local) :** verifier l'ampleur des orphelins :
`SELECT statut, est_avoir, count(*) FROM factures WHERE projet_id IS NULL GROUP BY 1,2;`
Et s'assurer que les 5 chemins d'insert (Tasks 3-4 + echeancier/from-events deja non-null + avoir herite) sont deployes. Si la table `factures` est tres volumineuse, remplacer le `SET NOT NULL` par `ADD CONSTRAINT ... CHECK (projet_id IS NOT NULL) NOT VALID` -> `VALIDATE CONSTRAINT` -> `SET NOT NULL` (lock plus court).

- [ ] **Step 1: Ecrire le test pgTAP (echoue : verrou absent)**

Create `supabase/tests/21_factures_projet_libre.sql`:

```sql
-- ===========================================================================
-- Test : factures + projet libre (verrou NOT NULL, RLS, backfill vs gel)
-- ===========================================================================
-- Migrations : 20260630120000_projets_libre.sql,
--              20260630120500_factures_backfill_projet_libre_notnull.sql
-- Spec : sections 5 (backfill + trigger gel), RLS (visibilite), 6 (verrou)

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

CREATE TEMP TABLE _ctx (
  admin_id UUID, cdp_id UUID, client_id UUID, libre_id UUID
);
INSERT INTO _ctx (admin_id, cdp_id, client_id)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (id, email)
SELECT admin_id, 'admin-libre@test.local' FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-libre@test.local' FROM _ctx;

INSERT INTO public.users (id, email, prenom, nom, role)
SELECT admin_id, 'admin-libre@test.local', 'Admin', 'Libre', 'admin'::role_utilisateur FROM _ctx
UNION ALL SELECT cdp_id, 'cdp-libre@test.local', 'Cdp', 'Libre', 'cdp'::role_utilisateur FROM _ctx;

INSERT INTO clients (id, raison_sociale, trigramme, is_demo, archive)
SELECT client_id, 'Test Facture Libre', 'TFL', false, false FROM _ctx;

-- ----- Assertion 1 : verrou NOT NULL (insert sans projet_id => 23502) -----
SELECT throws_ok($$
  INSERT INTO factures (client_id, date_emission, date_echeance, mois_concerne,
                        montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                        societe_emettrice_id)
  SELECT client_id, '2026-05-01', '2026-06-30', '2026-05',
         100, 20, 20, 120, 'a_emettre', false,
         (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx
$$, '23502', NULL, 'Insert facture sans projet_id : not_null_violation (verrou actif)');

-- ----- Assertions 2-3 : RLS visibilite (CDP ne voit pas une facture libre) -
UPDATE _ctx SET libre_id = get_or_create_projet_libre((SELECT client_id FROM _ctx));

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT libre_id, client_id, '2026-05-01', '2026-06-30', '2026-05',
       300, 20, 60, 360, 'emise', false,
       'FAC-TFL-9998', 999998,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx;

CREATE OR REPLACE FUNCTION pg_temp.count_visible_facture_as(p_user_id UUID, p_ref TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
  SELECT count(*) INTO v_count FROM public.factures WHERE ref = p_ref;
  RESET role;
  RETURN v_count;
END; $$;

SELECT is(
  pg_temp.count_visible_facture_as((SELECT cdp_id FROM _ctx), 'FAC-TFL-9998'),
  0, 'CDP ne voit PAS une facture libre (projet libre cdp_id NULL)');

SELECT is(
  pg_temp.count_visible_facture_as((SELECT admin_id FROM _ctx), 'FAC-TFL-9998'),
  1, 'Admin voit la facture libre');

-- ----- Assertions 4-5 : backfill d'une facture EMISE orpheline malgre le gel
-- Simule l'etat pre-backfill en levant temporairement le NOT NULL (rollback en
-- fin de transaction). Reproduit la logique exacte de la migration de backfill.
ALTER TABLE factures ALTER COLUMN projet_id DROP NOT NULL;

INSERT INTO factures (projet_id, client_id, date_emission, date_echeance, mois_concerne,
                      montant_ht, taux_tva, montant_tva, montant_ttc, statut, est_avoir,
                      ref, numero_seq, societe_emettrice_id)
SELECT NULL, client_id, '2026-04-01', '2026-05-31', '2026-04',
       150, 20, 30, 180, 'emise', false,
       'FAC-TFL-8888', 999997,
       (SELECT id FROM societes_emettrices WHERE code='SOL') FROM _ctx;

ALTER TABLE factures DISABLE TRIGGER trg_factures_freeze_after_emission;
SELECT get_or_create_projet_libre(c.client_id)
FROM (SELECT DISTINCT client_id FROM factures WHERE projet_id IS NULL) c;
UPDATE factures f SET projet_id = p.id FROM projets p
WHERE f.projet_id IS NULL AND p.client_id = f.client_id AND p.est_libre;
ALTER TABLE factures ENABLE TRIGGER trg_factures_freeze_after_emission;

SELECT isnt(
  (SELECT projet_id FROM factures WHERE ref='FAC-TFL-8888'), NULL,
  'Backfill : facture emise orpheline recoit un projet_id malgre le trigger de gel');

SELECT is(
  (SELECT p.est_libre FROM factures f JOIN projets p ON p.id=f.projet_id
   WHERE f.ref='FAC-TFL-8888'),
  true, 'Backfill : le projet affecte est un projet libre');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Lancer le test pour le voir echouer**

Run: `npx supabase test db`
Expected: `21_factures_projet_libre.sql` echoue sur l'assertion 1 (l'insert sans projet_id reussit tant que la colonne est nullable -> pas de 23502).

- [ ] **Step 3: Ecrire la migration de backfill + verrou**

Create `supabase/migrations/20260630120500_factures_backfill_projet_libre_notnull.sql`:

```sql
-- Backfill : rattache toute facture orpheline (projet_id IS NULL) au projet
-- libre de son client, puis verrouille la colonne en NOT NULL.
-- Couvre factures libres + issues de devis + avoirs orphelins historiques.

-- 1. Un projet libre par client ayant au moins une facture orpheline.
--    Reutilise get_or_create_projet_libre (source unique de la logique).
SELECT get_or_create_projet_libre(c.client_id)
FROM (SELECT DISTINCT client_id FROM factures WHERE projet_id IS NULL) c;

-- 2. Affectation. Le trigger freeze_facture_after_emission rend projet_id
--    immuable post-emission (20260515120000). Ici on REMPLIT un trou
--    (NULL -> projet), pas une mutation d'une valeur legale emise : projet_id
--    n'apparait ni sur le PDF ni dans le move Odoo. Neutralisation locale,
--    transactionnelle (DDL transactionnel : rollback si la migration echoue).
ALTER TABLE factures DISABLE TRIGGER trg_factures_freeze_after_emission;

UPDATE factures f
SET projet_id = p.id
FROM projets p
WHERE f.projet_id IS NULL
  AND p.client_id = f.client_id
  AND p.est_libre;

ALTER TABLE factures ENABLE TRIGGER trg_factures_freeze_after_emission;

-- 3. Verrou : plus aucune facture sans projet. Echoue si un orphelin subsiste.
--    NB : mois_concerne et facture_lignes.contrat_id restent VOLONTAIREMENT
--    nullable (factures devis sans mois_concerne, lignes libres/devis sans
--    contrat). On ne re-verrouille QUE projet_id.
ALTER TABLE factures ALTER COLUMN projet_id SET NOT NULL;
```

- [ ] **Step 4: Appliquer la migration en local**

Run: `npx supabase db push`
Expected: `Applying migration 20260630120500_...` sans erreur (en local, aucune facture orpheline : backfill no-op, verrou pose).

- [ ] **Step 5: Relancer le test pgTAP (passe)**

Run: `npx supabase test db`
Expected: `20_projet_libre.sql` (9/9) et `21_factures_projet_libre.sql` (5/5) ... `ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260630120500_factures_backfill_projet_libre_notnull.sql supabase/tests/21_factures_projet_libre.sql
git commit -m "feat(projet-libre): backfill des factures orphelines + verrou projet_id NOT NULL"
```

---

## Task 8: Verification finale + facture-legal-check

**Files:** aucun (verification globale).

- [ ] **Step 1: Suite de tests TS complete**

Run: `npm test`
Expected: tous les tests verts (dont `projet-libre-helper`, `create-free-brouillon`, `devis-to-facture-projet-libre`).

- [ ] **Step 2: pgTAP complet**

Run: `npx supabase test db`
Expected: l'ensemble des fichiers `supabase/tests/*.sql` verts, dont `20_*` et `21_*`.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build Next.js OK.

- [ ] **Step 5: facture-legal-check (skill)**

Cette feature touche `lib/actions/factures`, `lib/actions/devis-to-facture.ts` et `supabase/migrations/*factures*`. Lancer la verif legale :

Run: `grep -rn "DELETE FROM factures\|DELETE FROM facture_lignes" lib/ app/ supabase/`
Expected: aucune occurrence introduite par cette feature.

Verifier que le trigger de numerotation gapless n'est PAS modifie :
Run: `grep -rn "assign_facture_ref_on_send\|generate_facture_ref\|numero_seq" supabase/migrations/20260630*`
Expected: aucune occurrence (les migrations de cette feature ne touchent QUE `projets`, la typologie `LIB`, et le verrou `projet_id`).

**Point de confirmation explicite (legal) :** la migration `20260630120500` fait `DISABLE/ENABLE TRIGGER trg_factures_freeze_after_emission` (trigger de GEL post-emission, **pas** le trigger de numerotation), uniquement le temps du backfill `NULL -> projet`, dans la transaction de migration. Confirmer ce point avec le owner avant deploiement prod.

- [ ] **Step 6: Finaliser la branche**

REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch pour decider du mode d'integration (PR / merge). Rappel (memoire projet) : main protege par CI (Lint/typecheck/test/build + Playwright + react-doctor) ; deploiement prod MANUEL via `vercel deploy --prod`. Appliquer les migrations prod (`db:migrate`) APRES deploiement du code, dans l'ordre des Pre-requis de la Task 7.

---

## Self-Review (verification du plan vs spec)

**Couverture spec sections 1-6 :**

- 1 (migration schema : est_libre, index unique, typologie LIB, fonction) -> Task 1.
- 2 (helper find-or-create) -> fonction SQL (Task 1) + wrapper RPC (Task 2).
- 3 (branchement libre + devis ; avoir/echeancier/from-events inchanges) -> Tasks 3-4 (les 3 chemins non touches sont verifies non-null dans la spec).
- 4 (exclusion pickers/listings) -> Task 5 (+ Task 6 typologie).
- 5 (backfill + trigger de gel) -> Task 7.
- 6 (verrou projet_id UNIQUEMENT) -> Task 7.
- Tests spec (RLS visibilite, 5 chemins, backfill malgre gel, NOT NULL) -> pgTAP Tasks 1 & 7 + TS Tasks 2-4.

**Coherence des noms :** `get_or_create_projet_libre` (SQL) / `getOrCreateProjetLibre` (TS) ; argument RPC `p_client_id` partout (Task 1, 2, 3, 4) ; valeur de retour `{ ok, projetId }` consommee identiquement dans brouillon-libre et devis-to-facture.

**Hors plan (spec section 7) :** resolution analytique au push (gelee sur la decision D-B2). Non couvert ici par decision explicite.
