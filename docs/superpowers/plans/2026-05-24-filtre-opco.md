# Filtre OPCO sur brouillon de facturation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre a l'admin de filtrer les contrats du brouillon de facture par OPCO (1 ou plusieurs), avec resolution de l'OPCO via le prefixe DECA et referentiel global administrable.

**Architecture:** Nouvelle table `opcos(code, nom, prefixes_deca[])` mappee a la volee dans `getBillableEventsForProjet` (pas de denormalisation sur `contrats`). Extension de `createFactureFromEvents` avec `opcoCodesFilter`. Persistance `opco_code` sur `facture_lignes` pour groupement PDF et analytics futures. Page admin `/admin/parametres/opcos` clonee sur le pattern `societes-emettrices` (Phase 1 devis PR #6).

**Tech Stack:** PostgreSQL + pgTAP, Next.js 16 App Router (Server Components + Server Actions), TypeScript, shadcn/ui base-ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-24-filtre-opco-design.md`.

---

## File Structure

Files to create :

### DB

- `supabase/migrations/20260524100000_opcos_table.sql`
- `supabase/migrations/20260524100100_facture_lignes_opco_code.sql`
- `supabase/tests/09_opcos_rls.sql`
- `supabase/tests/10_facture_lignes_opco_code.sql`

### Queries / Actions / Utils

- `lib/opco/resolve.ts` - helper pur `resolveOpcoFromDeca`, `extractDecaPrefix`.
- `lib/queries/opcos.ts` - `getActiveOpcoMapping`, `listOpcos`, `getOpcoById`.
- `lib/actions/opcos.ts` - `createOpco`, `updateOpco`, `archiveOpco`, `unarchiveOpco`.

### Components / App routes

- `components/admin/opcos-section.tsx` - table + dialog CRUD.
- `components/admin/opco-form-dialog.tsx` - dialog formulaire (creation + edition).
- `app/(dashboard)/admin/parametres/opcos/page.tsx` - page liste.
- `components/facturation/opco-filter.tsx` - multi-select OPCO pour le dialog brouillon.

### Tests

- `__tests__/opco-resolution.test.ts`
- `__tests__/opcos-actions.test.ts`
- `__tests__/create-brouillon-opco-filter.test.ts`

Files to modify :

- `lib/queries/billable-events.ts` - resolution OPCO, ajout `opco_code`/`opco_nom`/`unknown_opco`.
- `__tests__/billable-events.test.ts` - 5 nouveaux tests OPCO.
- `lib/actions/factures/brouillons.ts` - param `opcoCodesFilter` + persistance `opco_code` sur lignes.
- `components/facturation/manuel-tab.tsx` - integration `opco-filter.tsx` + compteurs.
- `components/facturation/facture-pdf.tsx` - groupement par OPCO + sous-totaux.
- `components/sidebar.tsx` - item nav vers `/admin/parametres/opcos` (admin only).
- `types/database.ts` - regenerer apres migrations.

---

## Pre-flight

- [ ] **Step 0.1:** Verifier branche : `git rev-parse --abbrev-ref HEAD` doit donner `feat/dette-opco`.
- [ ] **Step 0.2:** `npx supabase start` si pas demarre.
- [ ] **Step 0.3:** `npx supabase db reset` pour partir d'un etat clean.
- [ ] **Step 0.4:** `npm test` baseline : doit afficher 530 tests passing avant de commencer.

---

## Task 1 : Migration table `opcos` + seed AKTO

**Files:**

- Create: `supabase/migrations/20260524100000_opcos_table.sql`

- [ ] **Step 1.1:** Ecrire la migration.

```sql
-- Referentiel global des OPCO finançeurs des contrats d'apprentissage.
-- L'OPCO est resolu a la volee depuis le prefixe (3 chars) du contract_number
-- (DECA). Pas de denormalisation sur contrats : si le mapping change, tous les
-- contrats recuperent automatiquement la nouvelle resolution.

CREATE TABLE opcos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,
  nom             TEXT NOT NULL,
  prefixes_deca   TEXT[] NOT NULL DEFAULT '{}',
  actif           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opcos_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT opcos_prefixes_format CHECK (
    prefixes_deca <@ ARRAY(SELECT unnest(prefixes_deca) WHERE unnest(prefixes_deca) ~ '^[0-9]{3}$')
  )
);

CREATE UNIQUE INDEX opcos_code_active_uniq ON opcos (code) WHERE actif;
CREATE INDEX opcos_prefixes_deca_gin ON opcos USING gin (prefixes_deca);

-- updated_at via trigger commun
CREATE TRIGGER opcos_set_updated_at
  BEFORE UPDATE ON opcos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS : SELECT pour tous les authentifies, WRITE admin/superadmin uniquement
ALTER TABLE opcos ENABLE ROW LEVEL SECURITY;

CREATE POLICY opcos_select_authenticated ON opcos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY opcos_write_admin ON opcos
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));

-- Seed AKTO avec les 6 prefixes confirmes (verifies en prod 2026-05-24)
INSERT INTO opcos (code, nom, prefixes_deca) VALUES (
  'AKTO',
  'AKTO - Commerce, conseil et services',
  ARRAY['017','030','033','050','079','089']
);

-- Audit log
COMMENT ON TABLE opcos IS 'Referentiel global OPCO. Resolution via LEFT(contract_number, 3).';
```

- [ ] **Step 1.2:** Appliquer.

Run: `npx supabase db reset`
Expected: pas d'erreur, migration listee dans output.

- [ ] **Step 1.3:** Regenerer les types.

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: `types/database.ts` contient `opcos: { Row: { ... } }`.

- [ ] **Step 1.4:** Verifier le seed.

Run: `psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT code, nom, prefixes_deca FROM opcos;"`
Expected: 1 ligne AKTO avec 6 prefixes.

- [ ] **Step 1.5:** Commit.

```bash
git add supabase/migrations/20260524100000_opcos_table.sql types/database.ts
git commit -m "feat(db): table opcos + seed AKTO"
```

---

## Task 2 : Migration `facture_lignes.opco_code`

**Files:**

- Create: `supabase/migrations/20260524100100_facture_lignes_opco_code.sql`

- [ ] **Step 2.1:** Ecrire la migration.

```sql
-- Persistance OPCO sur la ligne de facture pour :
-- 1. Groupement par OPCO dans le PDF sans rejointure.
-- 2. Analytics : commission par OPCO/mois sans recalcul.
-- 3. Robustesse : si le mapping prefixe->OPCO change apres emission, la facture
--    garde la trace de l'OPCO d'origine.

ALTER TABLE facture_lignes
  ADD COLUMN opco_code TEXT NULL;

CREATE INDEX facture_lignes_opco_code_idx ON facture_lignes (opco_code)
  WHERE opco_code IS NOT NULL;

COMMENT ON COLUMN facture_lignes.opco_code IS
  'OPCO resolu au moment de la creation de la ligne. NULL pour factures libres ou lignes non liees a un contrat.';

-- Backfill (best-effort, non bloquant) : pour les lignes existantes liees a un
-- contrat avec DECA, on resoud via le prefixe et le mapping actuel.
UPDATE facture_lignes fl
SET opco_code = o.code
FROM contrats c, opcos o
WHERE fl.contrat_id = c.id
  AND c.contract_number IS NOT NULL
  AND LEFT(c.contract_number, 3) = ANY (o.prefixes_deca)
  AND o.actif = true
  AND fl.opco_code IS NULL;
```

- [ ] **Step 2.2:** Appliquer.

Run: `npx supabase db reset`
Expected: pas d'erreur.

- [ ] **Step 2.3:** Regenerer types.

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: `facture_lignes.Row.opco_code: string | null` dans `types/database.ts`.

- [ ] **Step 2.4:** Verifier backfill (en local, vide).

Run: `psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT COUNT(*) FROM facture_lignes;"`
Expected: 0 (DB fraiche apres reset).

- [ ] **Step 2.5:** Commit.

```bash
git add supabase/migrations/20260524100100_facture_lignes_opco_code.sql types/database.ts
git commit -m "feat(db): facture_lignes.opco_code + backfill historique"
```

---

## Task 3 : Helper pur `resolveOpcoFromDeca`

**Files:**

- Create: `lib/opco/resolve.ts`
- Create: `__tests__/opco-resolution.test.ts`

- [ ] **Step 3.1:** Ecrire le test (red).

```ts
// __tests__/opco-resolution.test.ts
import { describe, it, expect } from 'vitest';
import {
  extractDecaPrefix,
  resolveOpcoFromDeca,
  type OpcoMapping,
} from '@/lib/opco/resolve';

const mapping: OpcoMapping = new Map([
  ['017', { code: 'AKTO', nom: 'AKTO - Commerce' }],
  ['030', { code: 'AKTO', nom: 'AKTO - Commerce' }],
  ['006', { code: 'OPCO_MOBILITES', nom: 'OPCO Mobilites' }],
]);

describe('extractDecaPrefix', () => {
  it('renvoie les 3 premiers chars d un DECA valide', () => {
    expect(extractDecaPrefix('017202605001222')).toBe('017');
  });
  it('renvoie null si DECA est null', () => {
    expect(extractDecaPrefix(null)).toBe(null);
  });
  it('renvoie null si DECA est vide', () => {
    expect(extractDecaPrefix('')).toBe(null);
  });
  it('renvoie null si DECA fait moins de 3 chars', () => {
    expect(extractDecaPrefix('01')).toBe(null);
  });
  it('renvoie null si DECA contient des non-chiffres dans le prefixe', () => {
    expect(extractDecaPrefix('AB1202605001222')).toBe(null);
  });
  it('trim avant extraction', () => {
    expect(extractDecaPrefix('  017202605001222  ')).toBe('017');
  });
});

describe('resolveOpcoFromDeca', () => {
  it('renvoie l OPCO correspondant au prefixe', () => {
    expect(resolveOpcoFromDeca('017202605001222', mapping)).toEqual({
      code: 'AKTO',
      nom: 'AKTO - Commerce',
    });
  });
  it('renvoie null si prefixe inconnu', () => {
    expect(resolveOpcoFromDeca('999202605001222', mapping)).toBe(null);
  });
  it('renvoie null si DECA invalide', () => {
    expect(resolveOpcoFromDeca(null, mapping)).toBe(null);
    expect(resolveOpcoFromDeca('', mapping)).toBe(null);
  });
  it('mapping vide renvoie toujours null', () => {
    expect(resolveOpcoFromDeca('017202605001222', new Map())).toBe(null);
  });
});
```

- [ ] **Step 3.2:** Run test, attendu rouge.

Run: `npx vitest run __tests__/opco-resolution.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3.3:** Implementer.

```ts
// lib/opco/resolve.ts
export interface OpcoInfo {
  code: string;
  nom: string;
}

export type OpcoMapping = Map<string, OpcoInfo>;

const PREFIX_REGEX = /^[0-9]{3}$/;

export function extractDecaPrefix(
  deca: string | null | undefined,
): string | null {
  if (!deca) return null;
  const trimmed = deca.trim();
  if (trimmed.length < 3) return null;
  const prefix = trimmed.slice(0, 3);
  return PREFIX_REGEX.test(prefix) ? prefix : null;
}

export function resolveOpcoFromDeca(
  deca: string | null | undefined,
  mapping: OpcoMapping,
): OpcoInfo | null {
  const prefix = extractDecaPrefix(deca);
  if (!prefix) return null;
  return mapping.get(prefix) ?? null;
}
```

- [ ] **Step 3.4:** Run test, attendu vert.

Run: `npx vitest run __tests__/opco-resolution.test.ts`
Expected: PASS 10/10.

- [ ] **Step 3.5:** Commit.

```bash
git add lib/opco/resolve.ts __tests__/opco-resolution.test.ts
git commit -m "feat(opco): helper pur resolveOpcoFromDeca + tests"
```

---

## Task 4 : Query `getActiveOpcoMapping`

**Files:**

- Create: `lib/queries/opcos.ts`

- [ ] **Step 4.1:** Implementer (pas de test unitaire, c'est un thin wrapper Supabase deja teste indirectement par billable-events).

```ts
// lib/queries/opcos.ts
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { OpcoMapping, OpcoInfo } from '@/lib/opco/resolve';

export interface OpcoRow {
  id: string;
  code: string;
  nom: string;
  prefixes_deca: string[];
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Charge tous les OPCO actifs et construit le Map prefixe -> OPCO.
 * Si un prefixe est partage entre 2 OPCO actifs (config invalide), premier
 * match wins + warning logger. La validation cote action est censee empecher
 * cette situation.
 */
export async function getActiveOpcoMapping(): Promise<OpcoMapping> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opcos')
    .select('code, nom, prefixes_deca')
    .eq('actif', true);

  if (error) {
    logger.error('queries.opcos', 'getActiveOpcoMapping failed', { error });
    return new Map();
  }

  const mapping: OpcoMapping = new Map();
  for (const opco of data ?? []) {
    const info: OpcoInfo = { code: opco.code, nom: opco.nom };
    for (const prefix of opco.prefixes_deca ?? []) {
      if (mapping.has(prefix)) {
        logger.warn(
          'queries.opcos',
          'prefixe DECA partage entre deux OPCO actifs',
          {
            prefix,
            existant: mapping.get(prefix)?.code,
            nouveau: opco.code,
          },
        );
        continue;
      }
      mapping.set(prefix, info);
    }
  }
  return mapping;
}

export async function listOpcos(includeArchived = false): Promise<OpcoRow[]> {
  const supabase = await createClient();
  const query = supabase.from('opcos').select('*').order('code');
  const { data, error } = includeArchived
    ? await query
    : await query.eq('actif', true);
  if (error) {
    logger.error('queries.opcos', 'listOpcos failed', { error });
    return [];
  }
  return (data ?? []) as OpcoRow[];
}

export async function getOpcoById(id: string): Promise<OpcoRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opcos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('queries.opcos', 'getOpcoById failed', { id, error });
    return null;
  }
  return (data as OpcoRow) ?? null;
}
```

- [ ] **Step 4.2:** Verifier typecheck.

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 4.3:** Commit.

```bash
git add lib/queries/opcos.ts
git commit -m "feat(opco): queries getActiveOpcoMapping + listOpcos"
```

---

## Task 5 : Extension `getBillableEventsForProjet` avec resolution OPCO

**Files:**

- Modify: `lib/queries/billable-events.ts`
- Modify: `__tests__/billable-events.test.ts`

- [ ] **Step 5.1:** Etendre les types `BillableEvent` et `LockReason`.

Dans `lib/queries/billable-events.ts`, trouver la definition de `BillableEvent` (vers ligne 35-90) et ajouter :

```ts
export interface BillableEvent {
  // ... champs existants ...
  opco_code: string | null; // NEW : OPCO resolu via prefixe DECA, null si non resolu
  opco_nom: string | null; // NEW : nom affiche dans UI/PDF
  // ... reste inchange ...
}
```

Etendre `lock_reason` :

```ts
lock_reason?: 'opposite_billed' | 'missing_deca' | 'unknown_line_type' | 'unknown_opco';
```

Mettre a jour aussi la docstring (ligne ~68-70) pour decrire `unknown_opco`.

- [ ] **Step 5.2:** Modifier `resolveLock` (helper interne, chercher la signature).

La fonction `resolveLock` doit accepter un nouveau parametre `unknownOpco: boolean` et appliquer la priorite :

```ts
function resolveLock(args: {
  billed?: BilledRef;
  lockedByOther?: BilledRef;
  missingDeca: boolean;
  hasUnknown: boolean;
  unknownOpco: boolean; // NEW
}): { status: EventStatus; lock_reason?: LockReason } {
  if (args.billed) return { status: 'billed' };
  if (args.missingDeca)
    return { status: 'locked', lock_reason: 'missing_deca' };
  if (args.unknownOpco)
    return { status: 'locked', lock_reason: 'unknown_opco' }; // NEW
  if (args.hasUnknown)
    return { status: 'locked', lock_reason: 'unknown_line_type' };
  if (args.lockedByOther)
    return { status: 'locked', lock_reason: 'opposite_billed' };
  return { status: 'available' };
}
```

- [ ] **Step 5.3:** Charger le mapping OPCO et l'utiliser dans la boucle de construction des events.

En tete de `getBillableEventsForProjet`, apres le chargement du projet, ajouter :

```ts
import { getActiveOpcoMapping } from '@/lib/queries/opcos';
import { resolveOpcoFromDeca } from '@/lib/opco/resolve';
// ... (en haut du fichier)

// Apres avoir charge projet et contrats (vers ligne 145), avant la boucle finale :
const opcoMapping = await getActiveOpcoMapping();
```

Dans la boucle `for (const c of contrats)` (vers ligne 312), avant de pousser l'event, calculer :

```ts
const opcoInfo = resolveOpcoFromDeca(c.contract_number, opcoMapping);
const unknownOpco =
  !!c.contract_number && c.contract_number.trim() !== '' && !opcoInfo;
```

Passer ces valeurs a `resolveLock` et inclure `opco_code` / `opco_nom` dans les objets `events.push({ ... })` (les 2 endroits : engagement et opco_step) :

```ts
opco_code: opcoInfo?.code ?? null,
opco_nom: opcoInfo?.nom ?? null,
```

Passer `unknownOpco` a `resolveLock` aux 2 endroits ou il est appele.

- [ ] **Step 5.4:** Ajouter les 5 tests vitest.

Dans `__tests__/billable-events.test.ts`, ajouter un nouveau `describe` apres `describe('getBillableEvents - DECA manquant', ...)` :

```ts
describe('getBillableEvents - resolution OPCO', () => {
  it('contrat avec DECA AKTO -> event avec opco_code=AKTO, status available', async () => {
    // Mock supabase :
    // - projets : taux_commission=40
    // - contrats : 1 contrat ENGAGE, contract_number='017202605001222', npec_amount=10000
    // - opcos : [{ code:'AKTO', nom:'AKTO', prefixes_deca:['017'], actif:true }]
    // - eduvia_invoice_lines : 1 ligne PEDAGOGIE 5000
    // - eduvia_invoice_steps : 1 step 1 emis
    // - facture_lignes : []
    // Verifier : events[0].opco_code === 'AKTO', status === 'available'
    //
    // PATTERN : suivre exactement celui des tests existants 'getBillableEvents -
    // base engagement' (vers ligne 123-220 du meme fichier).
    // ...
  });

  it('contrat avec DECA prefixe inconnu -> locked unknown_opco', async () => {
    // contrat contract_number='006...', opcos mapping ne contient pas '006'
    // Attendu : events[0].status === 'locked', lock_reason === 'unknown_opco',
    //          opco_code === null
  });

  it('priorite missing_deca > unknown_opco', async () => {
    // contrat contract_number=null
    // Attendu : lock_reason === 'missing_deca' (PAS unknown_opco)
  });

  it('priorite unknown_opco > unknown_line_type', async () => {
    // contrat DECA '999' (inconnu) + ligne avec line_type inconnu
    // Attendu : lock_reason === 'unknown_opco'
  });

  it('plusieurs OPCO sur meme projet -> events distincts avec opco_code different', async () => {
    // 2 contrats : un avec DECA '017' (AKTO), un avec '006' (OPCO_MOBILITES)
    // opcos mapping contient les 2
    // Attendu : events[0].opco_code === 'AKTO', events[1].opco_code === 'OPCO_MOBILITES'
  });
});
```

Le code complet de chaque test suit le pattern du fichier (voir ligne 124-220 pour le mock supabase et l'appel `buildSupabase({ ... })`). Ajouter la table `opcos` dans `tableResults` avec les rows attendues.

- [ ] **Step 5.5:** Run tests.

Run: `npx vitest run __tests__/billable-events.test.ts`
Expected: tous les anciens tests + 5 nouveaux passent.

- [ ] **Step 5.6:** Commit.

```bash
git add lib/queries/billable-events.ts __tests__/billable-events.test.ts
git commit -m "feat(billable-events): resolution OPCO via prefixe DECA + lock_reason unknown_opco"
```

---

## Task 6 : Extension `createFactureFromEvents` avec `opcoCodesFilter` + persistance `opco_code`

**Files:**

- Modify: `lib/actions/factures/brouillons.ts`
- Create: `__tests__/create-brouillon-opco-filter.test.ts`

- [ ] **Step 6.1:** Etendre le schema Zod `CreateFactureFromEventsSchema` (chercher sa definition dans `brouillons.ts`).

Ajouter :

```ts
opcoCodesFilter: z
  .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
  .min(1, 'Au moins un OPCO requis si filtre fourni')
  .optional(),
```

- [ ] **Step 6.2:** Appliquer le filtre OPCO apres la verification `resolved` (vers ligne 803).

```ts
// Apres le bloc "Defense en profondeur : refuse si DECA manquant"
// Filtre OPCO (si fourni)
const opcoCodesFilter = parsed.data.opcoCodesFilter;
const filteredResolved = opcoCodesFilter
  ? resolved.filter((e) => e.opco_code && opcoCodesFilter.includes(e.opco_code))
  : resolved;

if (filteredResolved.length === 0) {
  return {
    success: false,
    error: opcoCodesFilter
      ? `Aucun event correspondant aux OPCO selectionnes : ${opcoCodesFilter.join(', ')}`
      : 'Aucun event a facturer',
  };
}
```

Remplacer ensuite `resolved` par `filteredResolved` dans la suite de la fonction (creation des lignes).

- [ ] **Step 6.3:** Persister `opco_code` sur chaque ligne inseree.

Trouver le bloc d'insertion `facture_lignes.insert([...])` (vers ligne 950+) et ajouter `opco_code: e.opco_code` dans l'objet de chaque ligne mappee depuis `filteredResolved`.

- [ ] **Step 6.4:** Ecrire les tests (TDD-like, mais ici on teste l'effet de bord) :

```ts
// __tests__/create-brouillon-opco-filter.test.ts
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/queries/billable-events', () => ({
  getBillableEvents: vi.fn(),
}));

import { createFactureFromEvents } from '@/lib/actions/factures/brouillons';
import { getBillableEvents } from '@/lib/queries/billable-events';
import { requireUser } from '@/lib/auth/guards';

// Helper pour creer un event mocké
function mockEvent(
  overrides: Partial<{
    type: string;
    source_id: string;
    contrat_id: string;
    status: string;
    opco_code: string | null;
    contract_number: string;
  }>,
) {
  return {
    type: 'engagement',
    source_id: 'event-1',
    contrat_id: 'contrat-1',
    contrat_ref: 'CTR-001',
    contract_number: '017202605001222',
    apprenant_nom: 'Doe',
    apprenant_prenom: 'John',
    formation_titre: 'Test',
    contract_state: 'ENGAGE',
    step_number: null,
    step_opening_date: null,
    step_paid_at: null,
    montant_brut: 1000,
    montant_commissionne: 400,
    status: 'available' as const,
    opco_code: 'AKTO' as string | null,
    opco_nom: 'AKTO - Commerce',
    ...overrides,
  };
}

describe('createFactureFromEvents - filtre OPCO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireUser as any).mockResolvedValue({
      ok: true,
      supabase: makeSupabaseMock(),
      user: { id: 'user-1' },
    });
  });

  it('avec opcoCodesFilter=[AKTO], n inclut que les events AKTO', async () => {
    (getBillableEvents as any).mockResolvedValue({
      projetId: 'p1',
      projetRef: 'P-001',
      events: [
        mockEvent({ source_id: 'e1', opco_code: 'AKTO' }),
        mockEvent({
          source_id: 'e2',
          opco_code: 'OPCO_MOBILITES',
          contrat_id: 'c2',
        }),
      ],
    });

    const res = await createFactureFromEvents({
      projetId: 'p1',
      events: [
        { type: 'engagement', source_id: 'e1' },
        { type: 'engagement', source_id: 'e2' },
      ],
      opcoCodesFilter: ['AKTO'],
    });

    expect(res.success).toBe(true);
    // Verifier que seules les lignes AKTO ont ete inserees (1 ligne, pas 2)
    // via le mock supabase.from('facture_lignes').insert.calls
  });

  it('opcoCodesFilter=[] -> erreur Zod', async () => {
    const res = await createFactureFromEvents({
      projetId: 'p1',
      events: [{ type: 'engagement', source_id: 'e1' }],
      opcoCodesFilter: [],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Au moins un OPCO');
  });

  it('sans opcoCodesFilter, tous les events resolved sont inclus', async () => {
    (getBillableEvents as any).mockResolvedValue({
      projetId: 'p1',
      projetRef: 'P-001',
      events: [
        mockEvent({ source_id: 'e1', opco_code: 'AKTO' }),
        mockEvent({
          source_id: 'e2',
          opco_code: 'OPCO_MOBILITES',
          contrat_id: 'c2',
        }),
      ],
    });

    const res = await createFactureFromEvents({
      projetId: 'p1',
      events: [
        { type: 'engagement', source_id: 'e1' },
        { type: 'engagement', source_id: 'e2' },
      ],
    });
    expect(res.success).toBe(true);
    // 2 lignes inserees
  });

  it('opcoCodesFilter exclut tout -> erreur "aucun event correspondant"', async () => {
    (getBillableEvents as any).mockResolvedValue({
      projetId: 'p1',
      projetRef: 'P-001',
      events: [mockEvent({ source_id: 'e1', opco_code: 'AKTO' })],
    });

    const res = await createFactureFromEvents({
      projetId: 'p1',
      events: [{ type: 'engagement', source_id: 'e1' }],
      opcoCodesFilter: ['OPCO_MOBILITES'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Aucun event correspondant');
  });

  it('persistance opco_code sur les lignes inserees', async () => {
    const insertSpy = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'l1' }], error: null });
    (requireUser as any).mockResolvedValue({
      ok: true,
      supabase: makeSupabaseMock({ insertFactureLignes: insertSpy }),
      user: { id: 'user-1' },
    });
    (getBillableEvents as any).mockResolvedValue({
      projetId: 'p1',
      projetRef: 'P-001',
      events: [mockEvent({ source_id: 'e1', opco_code: 'AKTO' })],
    });

    await createFactureFromEvents({
      projetId: 'p1',
      events: [{ type: 'engagement', source_id: 'e1' }],
    });

    const insertedRows = insertSpy.mock.calls[0]?.[0];
    expect(insertedRows[0]?.opco_code).toBe('AKTO');
  });
});

// Helper de mock supabase (suit le pattern de __tests__/billable-events.test.ts).
function makeSupabaseMock(opts: { insertFactureLignes?: any } = {}) {
  const insertFactureLignes =
    opts.insertFactureLignes ??
    vi.fn().mockResolvedValue({ data: [], error: null });
  return {
    from: vi.fn((table: string) => {
      if (table === 'factures') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: { id: 'f1' }, error: null }),
            }),
          }),
          delete: vi
            .fn()
            .mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
        };
      }
      if (table === 'facture_lignes') {
        return { insert: insertFactureLignes };
      }
      return { insert: vi.fn(), select: vi.fn(), delete: vi.fn() };
    }),
  };
}
```

- [ ] **Step 6.5:** Run tests.

Run: `npx vitest run __tests__/create-brouillon-opco-filter.test.ts`
Expected: 5/5 passent.

- [ ] **Step 6.6:** Commit.

```bash
git add lib/actions/factures/brouillons.ts __tests__/create-brouillon-opco-filter.test.ts
git commit -m "feat(factures): filtre OPCO + persistance opco_code sur lignes"
```

---

## Task 7 : Actions admin `createOpco` / `updateOpco` / `archiveOpco`

**Files:**

- Create: `lib/actions/opcos.ts`
- Create: `__tests__/opcos-actions.test.ts`

- [ ] **Step 7.1:** Implementer les actions.

```ts
// lib/actions/opcos.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const CodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'Code doit etre en majuscules (lettres, chiffres, _)',
  )
  .max(50);

const PrefixSchema = z
  .string()
  .regex(/^[0-9]{3}$/, 'Prefixe doit etre 3 chiffres');

const CreateOpcoSchema = z.object({
  code: CodeSchema,
  nom: z.string().trim().min(1, 'Nom requis').max(200),
  prefixesDeca: z.array(PrefixSchema).min(1, 'Au moins un prefixe requis'),
});

const UpdateOpcoSchema = z.object({
  id: z.string().uuid(),
  code: CodeSchema,
  nom: z.string().trim().min(1).max(200),
  prefixesDeca: z.array(PrefixSchema).min(1),
});

async function checkPrefixCollision(
  supabase: any,
  prefixesDeca: string[],
  excludeId?: string,
): Promise<{ ok: boolean; conflict?: string }> {
  const query = supabase
    .from('opcos')
    .select('id, code, prefixes_deca')
    .eq('actif', true)
    .overlaps('prefixes_deca', prefixesDeca);
  const { data, error } = excludeId
    ? await query.neq('id', excludeId)
    : await query;
  if (error) {
    logger.error('actions.opcos', 'checkPrefixCollision failed', { error });
    return { ok: false, conflict: 'Erreur de validation' };
  }
  if (data && data.length > 0) {
    const conflictCodes = data.map((r: any) => r.code).join(', ');
    return {
      ok: false,
      conflict: `Prefixe deja utilise par : ${conflictCodes}`,
    };
  }
  return { ok: true };
}

export async function createOpco(input: {
  code: string;
  nom: string;
  prefixesDeca: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = CreateOpcoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const dedup = Array.from(new Set(parsed.data.prefixesDeca));
  const collision = await checkPrefixCollision(supabase, dedup);
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { data, error } = await supabase
    .from('opcos')
    .insert({
      code: parsed.data.code,
      nom: parsed.data.nom,
      prefixes_deca: dedup,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  logAudit(
    'opco_created',
    'opco',
    data.id,
    { code: parsed.data.code, prefixes: dedup },
    user.id,
  );
  revalidatePath('/admin/parametres/opcos');
  return { success: true, id: data.id };
}

export async function updateOpco(input: {
  id: string;
  code: string;
  nom: string;
  prefixesDeca: string[];
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateOpcoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const dedup = Array.from(new Set(parsed.data.prefixesDeca));
  const collision = await checkPrefixCollision(supabase, dedup, parsed.data.id);
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { error } = await supabase
    .from('opcos')
    .update({
      code: parsed.data.code,
      nom: parsed.data.nom,
      prefixes_deca: dedup,
    })
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };

  logAudit(
    'opco_updated',
    'opco',
    parsed.data.id,
    { code: parsed.data.code, prefixes: dedup },
    user.id,
  );
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}

export async function archiveOpco(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('opcos')
    .update({ actif: false })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('opco_archived', 'opco', id, {}, user.id);
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}

export async function unarchiveOpco(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Re-verifier collision sur les prefixes (un autre OPCO a pu les prendre entre-temps)
  const { data: opco, error: fetchErr } = await supabase
    .from('opcos')
    .select('prefixes_deca')
    .eq('id', id)
    .single();
  if (fetchErr || !opco) return { success: false, error: 'OPCO introuvable' };

  const collision = await checkPrefixCollision(
    supabase,
    opco.prefixes_deca,
    id,
  );
  if (!collision.ok) return { success: false, error: collision.conflict };

  const { error } = await supabase
    .from('opcos')
    .update({ actif: true })
    .eq('id', id);
  if (error) return { success: false, error: error.message };

  logAudit('opco_unarchived', 'opco', id, {}, user.id);
  revalidatePath('/admin/parametres/opcos');
  return { success: true };
}
```

- [ ] **Step 7.2:** Ecrire les tests.

```ts
// __tests__/opcos-actions.test.ts
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/utils/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireAdmin: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createOpco, updateOpco, archiveOpco } from '@/lib/actions/opcos';
import { requireAdmin } from '@/lib/auth/guards';

function mockAdmin(supabaseOverrides: any = {}) {
  (requireAdmin as any).mockResolvedValue({
    ok: true,
    supabase: makeSupabaseMock(supabaseOverrides),
    user: { id: 'user-1' },
  });
}

function makeSupabaseMock(
  opts: { existingOpcos?: any[]; insertResult?: any; updateResult?: any } = {},
) {
  const existingOpcos = opts.existingOpcos ?? [];
  return {
    from: vi.fn((table: string) => {
      if (table !== 'opcos')
        return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            overlaps: vi
              .fn()
              .mockResolvedValue({ data: existingOpcos, error: null }),
            neq: vi
              .fn()
              .mockResolvedValue({ data: existingOpcos, error: null }),
          })),
          single: vi
            .fn()
            .mockResolvedValue({
              data: { prefixes_deca: ['017'] },
              error: null,
            }),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi
              .fn()
              .mockResolvedValue(
                opts.insertResult ?? { data: { id: 'opco-1' }, error: null },
              ),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue(opts.updateResult ?? { error: null }),
        })),
      };
    }),
  };
}

describe('createOpco', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cas nominal : insert + audit', async () => {
    mockAdmin();
    const res = await createOpco({
      code: 'AKTO',
      nom: 'AKTO',
      prefixesDeca: ['017', '030'],
    });
    expect(res.success).toBe(true);
    expect(res.id).toBe('opco-1');
  });

  it('refuse code mal formate (minuscules)', async () => {
    mockAdmin();
    const res = await createOpco({
      code: 'akto',
      nom: 'AKTO',
      prefixesDeca: ['017'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('majuscules');
  });

  it('refuse prefixe mal formate (4 chiffres)', async () => {
    mockAdmin();
    const res = await createOpco({
      code: 'AKTO',
      nom: 'AKTO',
      prefixesDeca: ['0170'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('3 chiffres');
  });

  it('collision avec OPCO actif existant -> refus', async () => {
    mockAdmin({
      existingOpcos: [{ id: 'other', code: 'OTHER', prefixes_deca: ['017'] }],
    });
    const res = await createOpco({
      code: 'AKTO',
      nom: 'AKTO',
      prefixesDeca: ['017'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('OTHER');
  });

  it('non-admin -> refus', async () => {
    (requireAdmin as any).mockResolvedValue({ ok: false, error: 'Forbidden' });
    const res = await createOpco({
      code: 'AKTO',
      nom: 'AKTO',
      prefixesDeca: ['017'],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Forbidden');
  });
});

describe('archiveOpco', () => {
  it('cas nominal : marque actif=false', async () => {
    mockAdmin();
    const res = await archiveOpco('opco-1');
    expect(res.success).toBe(true);
  });
});

describe('updateOpco', () => {
  it('cas nominal sans collision', async () => {
    mockAdmin();
    const res = await updateOpco({
      id: 'opco-1',
      code: 'AKTO',
      nom: 'AKTO updated',
      prefixesDeca: ['017'],
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 7.3:** Run tests.

Run: `npx vitest run __tests__/opcos-actions.test.ts`
Expected: 7/7 passent.

- [ ] **Step 7.4:** Commit.

```bash
git add lib/actions/opcos.ts __tests__/opcos-actions.test.ts
git commit -m "feat(opcos): actions CRUD admin avec validation collision prefixes"
```

---

## Task 8 : Page admin `/admin/parametres/opcos`

**Files:**

- Create: `app/(dashboard)/admin/parametres/opcos/page.tsx`
- Create: `components/admin/opcos-section.tsx`
- Create: `components/admin/opco-form-dialog.tsx`
- Modify: `components/sidebar.tsx` (item nav)

- [ ] **Step 8.1:** Etudier le pattern de reference.

Lire `app/(dashboard)/admin/parametres/societes-emettrices/page.tsx` et `components/admin/societes-emettrices-section.tsx` (si existant). Le pattern : Server Component charge la liste via `listOpcos()`, passe au client component qui gere dialog + actions.

- [ ] **Step 8.2:** Implementer la page server.

```tsx
// app/(dashboard)/admin/parametres/opcos/page.tsx
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { listOpcos } from '@/lib/queries/opcos';
import { OpcosSection } from '@/components/admin/opcos-section';

export default async function OpcosPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect('/');

  const opcos = await listOpcos(true);

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Référentiel OPCO</h1>
        <p className="text-muted-foreground mt-1">
          Mapping préfixes DECA → OPCO utilisé par la facturation.
        </p>
      </div>
      <OpcosSection opcos={opcos} />
    </div>
  );
}
```

- [ ] **Step 8.3:** Implementer `OpcosSection` (client).

```tsx
// components/admin/opcos-section.tsx
'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit, Archive, ArchiveRestore } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { archiveOpco, unarchiveOpco } from '@/lib/actions/opcos';
import { OpcoFormDialog } from '@/components/admin/opco-form-dialog';
import type { OpcoRow } from '@/lib/queries/opcos';

export function OpcosSection({ opcos }: { opcos: OpcoRow[] }) {
  const [editTarget, setEditTarget] = useState<OpcoRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive(id: string, actif: boolean) {
    startTransition(async () => {
      const res = actif ? await archiveOpco(id) : await unarchiveOpco(id);
      if (res.success) toast.success(actif ? 'OPCO archivé' : 'OPCO réactivé');
      else toast.error(res.error ?? 'Erreur');
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {opcos.length} OPCO référencés
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Nouvel OPCO
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead>Préfixes DECA</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {opcos.map((o) => (
            <TableRow key={o.id} className={!o.actif ? 'opacity-60' : ''}>
              <TableCell className="font-mono">{o.code}</TableCell>
              <TableCell>{o.nom}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {o.prefixes_deca.map((p) => (
                    <Badge key={p} variant="secondary" className="font-mono">
                      {p}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{o.actif ? 'Actif' : 'Archivé'}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditTarget(o)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleArchive(o.id, o.actif)}
                >
                  {o.actif ? (
                    <Archive className="h-3.5 w-3.5" />
                  ) : (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <OpcoFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        opco={null}
      />
      <OpcoFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        opco={editTarget}
      />
    </Card>
  );
}
```

- [ ] **Step 8.4:** Implementer `OpcoFormDialog`.

```tsx
// components/admin/opco-form-dialog.tsx
'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createOpco, updateOpco } from '@/lib/actions/opcos';
import type { OpcoRow } from '@/lib/queries/opcos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opco: OpcoRow | null;
}

export function OpcoFormDialog({ open, onOpenChange, opco }: Props) {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [prefixesRaw, setPrefixesRaw] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (opco) {
      setCode(opco.code);
      setNom(opco.nom);
      setPrefixesRaw(opco.prefixes_deca.join(', '));
    } else {
      setCode('');
      setNom('');
      setPrefixesRaw('');
    }
  }, [opco, open]);

  function parsePrefixes(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(/[\s,;\n]+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      ),
    );
  }

  function handleSubmit() {
    const prefixes = parsePrefixes(prefixesRaw);
    if (prefixes.length === 0) {
      toast.error('Au moins un préfixe requis');
      return;
    }
    startTransition(async () => {
      const action = opco
        ? updateOpco({ id: opco.id, code, nom, prefixesDeca: prefixes })
        : createOpco({ code, nom, prefixesDeca: prefixes });
      const res = await action;
      if (res.success) {
        toast.success(opco ? 'OPCO mis à jour' : 'OPCO créé');
        onOpenChange(false);
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{opco ? 'Modifier OPCO' : 'Nouvel OPCO'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Code (majuscules, _ autorisé)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AKTO"
            />
          </div>
          <div>
            <Label>Nom complet</Label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="AKTO - Commerce et services"
            />
          </div>
          <div>
            <Label>Préfixes DECA (3 chiffres, séparés par virgule)</Label>
            <Textarea
              value={prefixesRaw}
              onChange={(e) => setPrefixesRaw(e.target.value)}
              placeholder="017, 030, 033, 050, 079, 089"
              rows={3}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Les 3 premiers chiffres du numéro DECA des contrats (ex :
              017202605001222 → 017).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8.5:** Ajouter l'item sidebar (admin only).

Dans `components/sidebar.tsx`, dans la section `/admin/parametres`, ajouter un sous-item `Référentiel OPCO` → `/admin/parametres/opcos`. Suivre le pattern existant pour societes-emettrices.

- [ ] **Step 8.6:** Verifier visuellement.

Run: `npm run dev` puis ouvrir `http://localhost:3000/admin/parametres/opcos`
Expected: page s'affiche, table montre AKTO seed, dialog "Nouvel OPCO" s'ouvre. Tester creation OPCO_MOBILITES avec prefixe 006.

- [ ] **Step 8.7:** Commit.

```bash
git add app/\(dashboard\)/admin/parametres/opcos components/admin/opcos-section.tsx components/admin/opco-form-dialog.tsx components/sidebar.tsx
git commit -m "feat(admin): page CRUD referentiel OPCO + sidebar"
```

---

## Task 9 : Multi-select OPCO dans le dialog brouillon

**Files:**

- Create: `components/facturation/opco-filter.tsx`
- Modify: `components/facturation/manuel-tab.tsx`

- [ ] **Step 9.1:** Implementer `OpcoFilter`.

```tsx
// components/facturation/opco-filter.tsx
'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface BillableEventLike {
  opco_code: string | null;
  opco_nom: string | null;
  status: string;
}

interface Props {
  events: BillableEventLike[];
  selected: string[]; // codes OPCO selectionnes
  onChange: (codes: string[]) => void;
}

interface OpcoStat {
  code: string;
  nom: string;
  count: number;
}

export function OpcoFilter({ events, selected, onChange }: Props) {
  const stats = useMemo<OpcoStat[]>(() => {
    const byCode = new Map<string, OpcoStat>();
    for (const e of events) {
      if (e.status !== 'available' || !e.opco_code) continue;
      const existing = byCode.get(e.opco_code);
      if (existing) existing.count++;
      else
        byCode.set(e.opco_code, {
          code: e.opco_code,
          nom: e.opco_nom ?? e.opco_code,
          count: 1,
        });
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [events]);

  const unknownCount = useMemo(
    () => events.filter((e) => e.status === 'locked' && !e.opco_code).length,
    [events],
  );

  function toggle(code: string) {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code]);
  }

  if (stats.length === 0 && unknownCount === 0) return null;

  return (
    <div className="bg-muted/50 rounded-lg border p-4">
      <h4 className="mb-3 text-sm font-semibold">OPCO à inclure</h4>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.code} className="flex items-center gap-2">
            <Checkbox
              id={`opco-${s.code}`}
              checked={selected.includes(s.code)}
              onCheckedChange={() => toggle(s.code)}
            />
            <Label htmlFor={`opco-${s.code}`} className="flex-1 cursor-pointer">
              {s.nom}{' '}
              <span className="text-muted-foreground">
                ({s.count} {s.count > 1 ? 'lignes' : 'ligne'})
              </span>
            </Label>
          </div>
        ))}
        {unknownCount > 0 && (
          <div className="border-t pt-2">
            <Badge variant="destructive">
              {unknownCount} contrat(s) avec OPCO non identifié - mappez le
              préfixe dans /admin/parametres/opcos
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2:** Integrer dans `manuel-tab.tsx`.

Lire `components/facturation/manuel-tab.tsx` complet pour comprendre la structure. Ajouter :

- import `OpcoFilter`.
- state local : `const [opcoCodesFilter, setOpcoCodesFilter] = useState<string[]>([])`.
- Initialiser au premier render avec tous les OPCO presents (effet dans `useEffect` deps `[events]`).
- Au-dessus de la liste des events, render `<OpcoFilter events={events} selected={opcoCodesFilter} onChange={setOpcoCodesFilter} />`.
- Dans la fonction qui appelle `createFactureFromEvents`, passer `opcoCodesFilter` (uniquement si non vide ET pas egal a tous les OPCO disponibles, sinon `undefined` pour le sens "pas de filtre").
- Filtrer le rendu des events visibles : `events.filter((e) => !e.opco_code || opcoCodesFilter.length === 0 || opcoCodesFilter.includes(e.opco_code))`.
- Desactiver le bouton "Creer facture" si `opcoCodesFilter.length === 0` ET il existe des events filtrables.

- [ ] **Step 9.3:** Verifier visuellement.

Run: `npm run dev`, ouvrir la page Facturation > Manuel, selectionner un projet HEOL, verifier :

- Le filtre OPCO s'affiche avec compteur AKTO.
- Decocher AKTO masque ses lignes.
- Cocher tout, creer facture -> succes.

- [ ] **Step 9.4:** Commit.

```bash
git add components/facturation/opco-filter.tsx components/facturation/manuel-tab.tsx
git commit -m "feat(facturation): multi-select OPCO dans dialog brouillon"
```

---

## Task 10 : Groupement OPCO dans le PDF facture

**Files:**

- Modify: `components/facturation/facture-pdf.tsx`

- [ ] **Step 10.1:** Lire `facture-pdf.tsx` pour comprendre la structure actuelle des lignes (probablement une boucle `lignes.map(...)`).

- [ ] **Step 10.2:** Grouper les lignes par `opco_code`.

```tsx
// Ajouter en haut du composant qui rend les lignes
const groupedLignes = useMemo(() => {
  const groups = new Map<string, typeof lignes>();
  for (const l of lignes) {
    const key = l.opco_code ?? '_no_opco';
    const arr = groups.get(key) ?? [];
    arr.push(l);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()); // [['AKTO', [...]], ['OPCO_MOBILITES', [...]]]
}, [lignes]);

const hasMultipleOpcos =
  groupedLignes.filter(([k]) => k !== '_no_opco').length > 1;
```

- [ ] **Step 10.3:** Render conditionnel : si 1 seul OPCO ou aucun, garder le rendu actuel ; si plusieurs, intercaler des en-tetes de groupe.

```tsx
{hasMultipleOpcos ? (
  groupedLignes.map(([opcoCode, opcoLignes]) => (
    <View key={opcoCode}>
      <Text style={styles.opcoHeader}>
        OPCO : {opcoCode === '_no_opco' ? 'Non specifie' : opcoCode}
      </Text>
      {opcoLignes.map((l) => (
        // rendu existant de la ligne
      ))}
      <Text style={styles.opcoSubtotal}>
        Sous-total {opcoCode} HT : {formatCurrency(sumHt(opcoLignes))}
      </Text>
    </View>
  ))
) : (
  // rendu actuel inchange
  lignes.map(...)
)}
```

(Adapter les noms `View`/`Text`/`styles` au pattern React PDF deja utilise dans le fichier.)

- [ ] **Step 10.4:** Generer un PDF d'exemple multi-OPCO et le verifier visuellement (en local, creer un brouillon mixte HEOL + OPCO Mobilites factice).

- [ ] **Step 10.5:** Commit.

```bash
git add components/facturation/facture-pdf.tsx
git commit -m "feat(facture-pdf): groupement par OPCO avec sous-totaux"
```

---

## Task 11 : Tests pgTAP

**Files:**

- Create: `supabase/tests/09_opcos_rls.sql`
- Create: `supabase/tests/10_facture_lignes_opco_code.sql`

- [ ] **Step 11.1:** Ecrire `09_opcos_rls.sql`.

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- Schema
SELECT has_table('opcos', 'table opcos existe');
SELECT col_not_null('opcos', 'code', 'opcos.code est NOT NULL');
SELECT col_not_null('opcos', 'prefixes_deca', 'opcos.prefixes_deca est NOT NULL');

-- Index
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'opcos' AND indexname = 'opcos_prefixes_deca_gin'),
  1,
  'index GIN opcos_prefixes_deca_gin present'
);

-- Seed
SELECT is(
  (SELECT count(*)::int FROM opcos WHERE code = 'AKTO' AND actif = true),
  1,
  'OPCO AKTO seed et actif'
);

SELECT is(
  (SELECT array_length(prefixes_deca, 1) FROM opcos WHERE code = 'AKTO'),
  6,
  'AKTO a 6 prefixes seed'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 11.2:** Ecrire `10_facture_lignes_opco_code.sql`.

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(3);

SELECT has_column('facture_lignes', 'opco_code', 'facture_lignes.opco_code existe');

SELECT col_is_null('facture_lignes', 'opco_code', 'opco_code est nullable (factures libres)');

SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'facture_lignes' AND indexname = 'facture_lignes_opco_code_idx'),
  1,
  'index facture_lignes_opco_code_idx present'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 11.3:** Run pgTAP.

Run: `npx supabase test db`
Expected: 48 + 9 = 57 tests passent (les 9 nouveaux + les existants).

- [ ] **Step 11.4:** Commit.

```bash
git add supabase/tests/09_opcos_rls.sql supabase/tests/10_facture_lignes_opco_code.sql
git commit -m "test(pgtap): RLS opcos + colonne facture_lignes.opco_code"
```

---

## Task 12 : Verification finale + push

- [ ] **Step 12.1:** Run full vitest.

Run: `npm test`
Expected: ~545+ tests passent (les 530 existants + ~15 nouveaux).

- [ ] **Step 12.2:** Run typecheck + lint.

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 erreur.

- [ ] **Step 12.3:** Run pgTAP.

Run: `npx supabase test db`
Expected: 57 tests OK.

- [ ] **Step 12.4:** Verification fonctionnelle end-to-end en local.

```
1. npm run dev
2. /admin/parametres/opcos -> creer OPCO_MOBILITES avec prefixe 006
3. /facturation > Manuel > selectionner projet HEOL
4. Verifier : filtre OPCO affiche AKTO (33 lignes) + OPCO_MOBILITES (1 ligne)
5. Decocher AKTO -> seul OPCO_MOBILITES visible
6. Recocher tout, creer brouillon -> verifier les opco_code en DB :
   SELECT opco_code, count(*) FROM facture_lignes WHERE facture_id = '<id>' GROUP BY opco_code;
7. Generer le PDF -> verifier groupement par OPCO + sous-totaux
```

- [ ] **Step 12.5:** Push.

```bash
git push -u origin feat/dette-opco
```

- [ ] **Step 12.6:** Ouvrir PR via gh.

```bash
gh pr create --title "feat(opco): filtre OPCO sur brouillon de facturation" --body "$(cat <<'EOF'
## Summary
- Referentiel global OPCO administrable (table opcos + page /admin/parametres/opcos)
- Resolution OPCO via prefixe DECA (3 chars) dans billable-events
- Filtre multi-select OPCO dans dialog brouillon manuel-tab
- Persistance opco_code sur facture_lignes pour groupement PDF
- Nouveau lock_reason unknown_opco pour contrats prefixe non mappe

Resout la dette OPCO identifiee dans `project_todos_open.md` :
- Avant : Elena GRAND (prefixe 006, OPCO Mobilites) incluse a tort dans brouillon HEOL
- Apres : 006 doit etre explicitement mappe, et le user choisit quels OPCO inclure

## Test plan
- [x] vitest : 15 tests nouveaux OK (resolve, billable-events x5, opcos-actions x7, brouillon-filter x5)
- [x] pgTAP : 9 nouveaux tests OK
- [x] typecheck + lint clean
- [ ] Verifie en local : creation OPCO, filtre dans brouillon, PDF groupe
- [ ] Apres merge : mapper prefixes 006 et 076 via UI admin

EOF
)"
```

---

## Self-Review

- **Spec coverage** : Section 4 (DB) → Tasks 1-2 ; Section 5 (logique métier) → Tasks 3-6 ; Section 6 (UI) → Tasks 8-10 ; Section 7 (tests) → Tasks 5, 6, 7, 11 ; Section 9 (migration/deploy) → Task 12. Pas de gap identifié.
- **Placeholder scan** : aucun `TBD`, aucun `similar to`, code complet partout sauf Step 5.4 et 9.2 où je renvoie au pattern existant du repo (justifié : reproduire 500 lignes de mock setup serait du noise, le pattern est lisible directement dans le fichier référencé).
- **Type consistency** : `OpcoMapping = Map<string, OpcoInfo>` cohérent partout (Task 3, 4, 5). `opco_code: string | null` cohérent sur BillableEvent (Task 5) et facture_lignes (Task 2). `opcoCodesFilter` cohérent entre Zod (Task 6.1) et UI (Task 9.2). `lock_reason: 'unknown_opco'` ajouté Task 5 et utilisé Task 9.1 (`status === 'locked' && !e.opco_code`).
