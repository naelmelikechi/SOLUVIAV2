# Phase 1 - Socle multi-societe + factures libres - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire un referentiel `societes_emettrices` (seed SOLUVIA), brancher `factures.societe_emettrice_id`, rendre le PDF facture dynamique sur la societe, et finaliser le dialog "nouvelle facture libre" avec selecteur societe. Pas de changement de la numerotation gapless en Phase 1 (reportee a Phase 4 quand DIGIVIA existera).

**Architecture:**

- Nouvelle table `societes_emettrices` (catalogue d'entites juridiques emettrices). Seed SOLUVIA en migration. RLS SELECT all auth / WRITE admin.
- `factures.societe_emettrice_id` FK NOT NULL apres backfill. Trigger `generate_facture_ref` reste inchange.
- `getEmetteurInfo()` lit la societe par id (default = SOLUVIA tant que seule societe seedee) au lieu de la table `parametres`. Signature etendue avec param optionnel `societeId`.
- `facture-pdf.tsx` recoit l'EmetteurInfo correspondant a la societe emettrice de la facture en prop, via les routes API existantes.
- `new-facture-libre-dialog.tsx` recoit la liste des societes actives et persiste le choix via `createFreeBrouillon`.

**Tech Stack:** Supabase (PostgreSQL, RLS, pgTAP), Next.js 16 App Router, TypeScript, shadcn/ui (base-ui), Vitest, jsdom.

**Spec de reference:** `docs/superpowers/specs/2026-05-22-devis-workflow-design.md` (sections 4.1, 4.3, 9, 13 Phase 1).

---

## File Structure (Phase 1)

Files created :

- `supabase/migrations/20260522100000_societes_emettrices.sql` - table + RLS + trigger updated_at + seed SOLUVIA.
- `supabase/migrations/20260522100100_factures_add_societe_emettrice.sql` - colonne nullable + backfill + NOT NULL + index.
- `supabase/tests/07_societes_emettrices_rls.sql` - pgTAP RLS societes_emettrices.
- `supabase/tests/08_factures_societe_emettrice_invariants.sql` - pgTAP non-regression trigger + invariants colonne.
- `lib/queries/societes-emettrices.ts` - queries CRUD + `getSocieteEmettriceById`, `listSocietesEmettricesActives`, `getDefaultSocieteEmettrice`.
- `lib/actions/societes-emettrices.ts` - server actions admin (create / update / archive). Audit log.
- `app/(dashboard)/admin/parametres/societes-emettrices/page.tsx` - liste admin.
- `app/(dashboard)/admin/parametres/societes-emettrices/[id]/page.tsx` - form edit.
- `app/(dashboard)/admin/parametres/societes-emettrices/nouvelle/page.tsx` - form create.
- `components/admin/societe-emettrice-form.tsx` - formulaire reutilisable.
- `__tests__/societe-emettrice-form.test.tsx` - Vitest form basics.
- `__tests__/new-facture-libre-dialog.test.tsx` - Vitest dialog (societe selector).

Files modified :

- `lib/queries/parametres.ts` : `getEmetteurInfo()` lit depuis `societes_emettrices` (param optionnel `societeId`). EMETTEUR_FALLBACK conserve mais marque comme last-resort.
- `lib/actions/factures/brouillons.ts` : `createFreeBrouillon` accepte `societeEmettriceId` et le persiste sur la facture.
- `components/facturation/new-facture-libre-dialog.tsx` : selecteur societe (default = societe par defaut active).
- `components/facturation/facture-pdf.tsx` : accepte `emetteur: EmetteurInfo` deja en prop (verifier) ou via FactureDetail enrichi.
- `lib/queries/factures.ts` (`getFactureDetail` ou equivalent) : join societes_emettrices pour exposer `societe_emettrice` sur FactureDetail.
- `types/database.ts` : regen avec la nouvelle table + colonne.
- `app/(dashboard)/facturation/page.tsx` ou `components/facturation/facture-list-columns.tsx` : badge "Libre" (factures sans `projet_id` et sans `devis_id`).

---

## Pre-flight

- [ ] **Step 0.1: Verifier branche propre et a jour**

```bash
git status
git log --oneline -3
```

Expected : worktree clean ou seulement la modif `components/projets/projets-data-table.tsx` deja en cours (a stasher / committer separement avant de demarrer).

- [ ] **Step 0.2: Demarrer Supabase local si pas deja up**

```bash
npx supabase status
# si pas up :
npx supabase start
```

Expected : `API URL: http://127.0.0.1:54321` etc.

- [ ] **Step 0.3: Snapshot du schema avant migration**

```bash
npx supabase db dump --local --data-only=false -f /tmp/schema-before-phase1.sql
```

Expected : fichier cree, sert de reference si rollback necessaire.

---

## Task 1 : Migration societes_emettrices (table + RLS + seed)

**Files:**

- Create: `supabase/migrations/20260522100000_societes_emettrices.sql`
- Create: `supabase/tests/07_societes_emettrices_rls.sql`

- [ ] **Step 1.1: Ecrire la migration**

Path : `supabase/migrations/20260522100000_societes_emettrices.sql`

```sql
-- Phase 1 : referentiel des societes emettrices (SOLUVIA, DIGIVIA, ...).
-- En Phase 1 seul SOLUVIA est seede et toutes les factures pointent dessus.
-- La numerotation facture reste globale (trigger inchange). L'adaptation
-- par societe interviendra en Phase 4 quand DIGIVIA arrivera.

CREATE TABLE societes_emettrices (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                         TEXT NOT NULL UNIQUE,
  raison_sociale               TEXT NOT NULL,
  forme_juridique              TEXT,
  siret                        TEXT NOT NULL,
  tva_intracom                 TEXT NOT NULL,
  capital_social               NUMERIC(12, 2),
  adresse                      TEXT NOT NULL,
  code_postal                  TEXT NOT NULL,
  ville                        TEXT NOT NULL,
  pays                         TEXT NOT NULL DEFAULT 'France',
  email_contact                TEXT NOT NULL,
  telephone                    TEXT,
  logo_url                     TEXT,
  banque_nom                   TEXT,
  banque_iban                  TEXT,
  banque_bic                   TEXT,
  mentions_legales             TEXT,
  conditions_reglement_default TEXT,
  validite_devis_jours         INTEGER NOT NULL DEFAULT 90 CHECK (validite_devis_jours > 0),
  odoo_company_id              INTEGER,
  odoo_journal_id              INTEGER,
  est_defaut                   BOOLEAN NOT NULL DEFAULT FALSE,
  actif                        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule societe peut etre marquee defaut a la fois (utilisee comme
-- default du dialog facture libre tant qu'on n'en a qu'une).
CREATE UNIQUE INDEX uq_societes_emettrices_defaut
  ON societes_emettrices (est_defaut)
  WHERE est_defaut = TRUE;

-- Trigger updated_at standardise (pattern : helper set_updated_at de
-- migrations existantes, voir 20260424123743 ou 00010_factures.sql).
CREATE TRIGGER trg_societes_emettrices_updated_at
  BEFORE UPDATE ON societes_emettrices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS : SELECT pour tous les utilisateurs authentifies (necessaire pour
-- le rendu PDF/email cote CDP), WRITE admin/superadmin only.
ALTER TABLE societes_emettrices ENABLE ROW LEVEL SECURITY;

CREATE POLICY societes_emettrices_select_authenticated
  ON societes_emettrices FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY societes_emettrices_admin_write
  ON societes_emettrices FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

-- Seed SOLUVIA. Valeurs reprises des constantes du script
-- scripts/render-devis-weetel.ts et components/facturation/facture-pdf.tsx
-- (EMETTEUR_FALLBACK). Le RIB sera complete via UI admin si absent en
-- table parametres existante (migrer manuellement si besoin).
INSERT INTO societes_emettrices (
  code, raison_sociale, forme_juridique, siret, tva_intracom, capital_social,
  adresse, code_postal, ville, pays, email_contact,
  banque_nom, banque_iban, banque_bic,
  mentions_legales, conditions_reglement_default,
  est_defaut, actif
) VALUES (
  'SOL',
  'S.A.S. SOLUVIA',
  'S.A.S.',
  '994 241 537 00012',
  'FR37994241537',
  NULL,
  '27 Rue Jacqueline Cochran',
  '79000',
  'Niort',
  'France',
  'contact@mysoluvia.com',
  'Credit Agricole Charente-Maritime Deux-Sevres',
  'FR76 1170 6337 1156 0576 1259 857',
  'AGRIFRPP817',
  'S.A.S. SOLUVIA - SIRET 994 241 537 00012 - TVA intracommunautaire FR37994241537',
  'Paiement par virement bancaire sous 30 jours. Penalites en cas de retard : 3 fois le taux d''interet legal + indemnite forfaitaire de 40 EUR pour frais de recouvrement (art. L441-10 Code de commerce).',
  TRUE,
  TRUE
);

COMMENT ON TABLE societes_emettrices IS
  'Referentiel des entites juridiques qui emettent devis et factures (SOLUVIA, DIGIVIA, ...). Une seule peut etre marquee defaut (est_defaut = TRUE).';
```

- [ ] **Step 1.2: Appliquer la migration localement**

```bash
npx supabase db reset
```

Expected : reset complet, derniere ligne `Applying migration 20260522100000_societes_emettrices.sql...`. Pas d'erreur sur le seed.

- [ ] **Step 1.3: Verifier le seed SOL en lecture directe**

```bash
npx supabase db psql --local -c "SELECT code, raison_sociale, est_defaut, actif FROM societes_emettrices;"
```

Expected : 1 row `SOL | S.A.S. SOLUVIA | t | t`.

- [ ] **Step 1.4: Ecrire le test pgTAP RLS**

Path : `supabase/tests/07_societes_emettrices_rls.sql`

```sql
-- Test : RLS societes_emettrices
-- - SELECT autorise pour tout role authentifie (admin, cdp, superadmin)
-- - WRITE autorise seulement pour admin et superadmin
-- - seed SOLUVIA present apres reset

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

-- ----- Assertion 1 : seed SOLUVIA present -----
SELECT is(
  (SELECT count(*)::int FROM societes_emettrices WHERE code = 'SOL'),
  1,
  'seed SOLUVIA insere avec code SOL'
);

-- ----- Assertion 2 : SOLUVIA est marquee defaut -----
SELECT ok(
  (SELECT est_defaut FROM societes_emettrices WHERE code = 'SOL'),
  'SOLUVIA est_defaut = TRUE'
);

-- ----- Assertion 3 : RLS activee -----
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'societes_emettrices'),
  'RLS active sur societes_emettrices'
);

-- ----- Assertion 4 : policy SELECT existe -----
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'societes_emettrices'
   AND policyname = 'societes_emettrices_select_authenticated'),
  1,
  'policy SELECT authenticated presente'
);

-- ----- Assertion 5 : policy WRITE admin existe -----
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE tablename = 'societes_emettrices'
   AND policyname = 'societes_emettrices_admin_write'),
  1,
  'policy admin_write presente'
);

-- ----- Assertion 6 : index unique sur est_defaut = TRUE -----
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'societes_emettrices'
   AND indexname = 'uq_societes_emettrices_defaut'),
  1,
  'index unique partial sur est_defaut present'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 1.5: Lancer le test pgTAP**

```bash
npx supabase test db
```

Expected : `7 tests passing` (les 6 existants + le nouveau). Tous PASS.

- [ ] **Step 1.6: Regenerer les types TypeScript**

```bash
npx supabase gen types typescript --local > types/database.ts
```

Expected : `types/database.ts` contient `societes_emettrices: { Row, Insert, Update, ... }`.

- [ ] **Step 1.7: Verifier typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected : 0 erreur.

- [ ] **Step 1.8: Commit**

```bash
git add supabase/migrations/20260522100000_societes_emettrices.sql \
        supabase/tests/07_societes_emettrices_rls.sql \
        types/database.ts
git commit -m "feat(db): table societes_emettrices + seed SOLUVIA

Phase 1 du chantier devis : referentiel multi-societe. Seul SOLUVIA
est seede (est_defaut = TRUE). DIGIVIA viendra en Phase 4. RLS :
SELECT all auth, WRITE admin/superadmin. Trigger numerotation factures
inchange (sequence globale en Phase 1).

Ref: docs/superpowers/specs/2026-05-22-devis-workflow-design.md (4.1)"
```

---

## Task 2 : Migration factures.societe_emettrice_id

**Files:**

- Create: `supabase/migrations/20260522100100_factures_add_societe_emettrice.sql`
- Create: `supabase/tests/08_factures_societe_emettrice_invariants.sql`

- [ ] **Step 2.1: Ecrire la migration en deux temps (nullable + backfill + NOT NULL)**

Path : `supabase/migrations/20260522100100_factures_add_societe_emettrice.sql`

```sql
-- Phase 1 : ajout factures.societe_emettrice_id. Toutes les factures
-- existantes sont assignees a SOLUVIA (le seul emetteur historique).
-- En deux temps pour respecter NOT NULL apres backfill.

-- 1. Ajout nullable
ALTER TABLE factures
  ADD COLUMN societe_emettrice_id UUID REFERENCES societes_emettrices(id);

-- 2. Backfill SOL pour tout l'existant
UPDATE factures f
   SET societe_emettrice_id = (SELECT id FROM societes_emettrices WHERE code = 'SOL')
 WHERE f.societe_emettrice_id IS NULL;

-- 3. Verification : aucune facture ne doit rester sans societe
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM factures WHERE societe_emettrice_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplet: % factures sans societe_emettrice_id', v_count;
  END IF;
END $$;

-- 4. Bascule en NOT NULL
ALTER TABLE factures
  ALTER COLUMN societe_emettrice_id SET NOT NULL;

-- 5. Index pour les filtres liste et le join PDF
CREATE INDEX idx_factures_societe_emettrice
  ON factures (societe_emettrice_id);

COMMENT ON COLUMN factures.societe_emettrice_id IS
  'Societe juridique emettrice de la facture (SOLUVIA, DIGIVIA, ...). Trace pour Odoo company mapping et PDF identity.';
```

- [ ] **Step 2.2: Appliquer la migration localement**

```bash
npx supabase db reset
```

Expected : reset OK, message `Backfill incomplet` PAS present, migration 20260522100100 appliquee.

- [ ] **Step 2.3: Verifier le backfill**

```bash
npx supabase db psql --local -c "SELECT count(*) AS total, count(societe_emettrice_id) AS avec_societe FROM factures;"
```

Expected : `total = avec_societe` (toutes les factures ont societe_emettrice_id set).

- [ ] **Step 2.4: Ecrire le test pgTAP invariants**

Path : `supabase/tests/08_factures_societe_emettrice_invariants.sql`

```sql
-- Test : factures.societe_emettrice_id
-- - colonne presente et NOT NULL
-- - FK vers societes_emettrices
-- - index present
-- - trigger generate_facture_ref inchange (non-regression)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

-- ----- Assertion 1 : colonne presente et NOT NULL -----
SELECT col_not_null(
  'factures', 'societe_emettrice_id',
  'factures.societe_emettrice_id est NOT NULL'
);

-- ----- Assertion 2 : FK vers societes_emettrices -----
SELECT is(
  (SELECT count(*)::int FROM information_schema.table_constraints
   WHERE table_name = 'factures'
   AND constraint_type = 'FOREIGN KEY'
   AND constraint_name LIKE '%societe_emettrice%'),
  1,
  'FK factures -> societes_emettrices presente'
);

-- ----- Assertion 3 : index present -----
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE tablename = 'factures' AND indexname = 'idx_factures_societe_emettrice'),
  1,
  'index idx_factures_societe_emettrice present'
);

-- ----- Assertion 4 : trigger generate_facture_ref existe toujours -----
SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname = 'generate_facture_ref'),
  1,
  'fonction generate_facture_ref preservee (non-regression Phase 1)'
);

-- ----- Assertion 5 : tous les factures existantes ont une societe -----
SELECT is(
  (SELECT count(*)::int FROM factures WHERE societe_emettrice_id IS NULL),
  0,
  'aucune facture sans societe_emettrice_id'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2.5: Lancer les tests pgTAP**

```bash
npx supabase test db
```

Expected : 8 tests passing.

- [ ] **Step 2.6: Regen types**

```bash
npx supabase gen types typescript --local > types/database.ts
```

Verifier que `types/database.ts` contient `societe_emettrice_id: string;` dans `factures.Row` (NOT NULL = type `string`, pas `string | null`).

- [ ] **Step 2.7: Verifier typecheck (probablement quelques `Insert` casses sur factures.create cote code)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected : erreurs TS sur les insertions `factures` qui ne fournissent pas `societe_emettrice_id`. Noter les fichiers a corriger (Task 6 les corrige).

- [ ] **Step 2.8: Commit (avant fix code pour bisect facile)**

```bash
git add supabase/migrations/20260522100100_factures_add_societe_emettrice.sql \
        supabase/tests/08_factures_societe_emettrice_invariants.sql \
        types/database.ts
git commit -m "feat(db): factures.societe_emettrice_id NOT NULL + backfill SOL

Toutes les factures existantes assignees a SOLUVIA. Migration en deux
temps (nullable + backfill + NOT NULL). Trigger generate_facture_ref
inchange (decision Phase 1).

Ref: docs/superpowers/specs/2026-05-22-devis-workflow-design.md (4.3)"
```

---

## Task 3 : Queries societes_emettrices

**Files:**

- Create: `lib/queries/societes-emettrices.ts`

- [ ] **Step 3.1: Ecrire les queries**

Path : `lib/queries/societes-emettrices.ts`

```ts
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type SocieteEmettriceRow =
  Database['public']['Tables']['societes_emettrices']['Row'];

export async function listSocietesEmettrices(): Promise<SocieteEmettriceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .order('est_defaut', { ascending: false })
    .order('code');
  if (error) {
    logger.error('queries.societes_emettrices', 'list failed', { error });
    throw new AppError(
      'SOCIETES_EMETTRICES_FETCH_FAILED',
      'Impossible de charger les societes emettrices',
      { cause: error },
    );
  }
  return data;
}

export async function listSocietesEmettricesActives(): Promise<
  SocieteEmettriceRow[]
> {
  const all = await listSocietesEmettrices();
  return all.filter((s) => s.actif);
}

export async function getSocieteEmettriceById(
  id: string,
): Promise<SocieteEmettriceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('queries.societes_emettrices', 'getById failed', {
      id,
      error,
    });
    throw new AppError(
      'SOCIETES_EMETTRICES_FETCH_FAILED',
      `Impossible de charger la societe emettrice ${id}`,
      { cause: error },
    );
  }
  return data;
}

export async function getDefaultSocieteEmettrice(): Promise<SocieteEmettriceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .select('*')
    .eq('est_defaut', true)
    .eq('actif', true)
    .maybeSingle();
  if (error) {
    logger.error('queries.societes_emettrices', 'getDefault failed', { error });
    return null;
  }
  return data;
}
```

- [ ] **Step 3.2: Typecheck**

```bash
npx tsc --noEmit lib/queries/societes-emettrices.ts 2>&1 | head
```

Expected : 0 erreur sur ce fichier (les erreurs ailleurs sont OK pour l'instant).

- [ ] **Step 3.3: Commit**

```bash
git add lib/queries/societes-emettrices.ts
git commit -m "feat(queries): societes emettrices (list, getById, getDefault)"
```

---

## Task 4 : Server actions admin societes_emettrices

**Files:**

- Create: `lib/actions/societes-emettrices.ts`

- [ ] **Step 4.1: Ecrire le test d'integration de l'action create (TDD)**

Path : `__tests__/societe-emettrice-actions.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// On mock supabase + audit + roles pour tester la logique de validation
// pure de l'action. Test d'integration DB possible en suite mais hors
// scope vitest (sera couvert par pgTAP RLS).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: 'new-id' }, error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/queries/users', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'u1', role: 'admin' })),
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

import { createSocieteEmettrice } from '@/lib/actions/societes-emettrices';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSocieteEmettrice', () => {
  it('rejette si code vide', async () => {
    const res = await createSocieteEmettrice({
      code: '',
      raison_sociale: 'Test',
      siret: '123',
      tva_intracom: 'FR',
      adresse: 'a',
      code_postal: 'cp',
      ville: 'v',
      email_contact: 'a@b.fr',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/code/i);
  });

  it('cree avec valeurs minimales', async () => {
    const res = await createSocieteEmettrice({
      code: 'TST',
      raison_sociale: 'Test',
      siret: '123',
      tva_intracom: 'FR',
      adresse: 'a',
      code_postal: '79000',
      ville: 'Niort',
      email_contact: 'a@b.fr',
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run failing test**

```bash
npm test -- societe-emettrice-actions
```

Expected : FAIL (module n'existe pas encore).

- [ ] **Step 4.3: Ecrire l'action**

Path : `lib/actions/societes-emettrices.ts`

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/queries/users';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin } from '@/lib/utils/roles';

const SocieteEmettriceSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, {
      message: 'Le code doit etre en majuscules et chiffres (ex: SOL, DIG)',
    }),
  raison_sociale: z.string().min(1, 'La raison sociale est obligatoire'),
  forme_juridique: z.string().nullish(),
  siret: z.string().min(1, 'Le SIRET est obligatoire'),
  tva_intracom: z.string().min(1, 'La TVA intracom est obligatoire'),
  capital_social: z.number().nullish(),
  adresse: z.string().min(1, "L'adresse est obligatoire"),
  code_postal: z.string().min(1, 'Le code postal est obligatoire'),
  ville: z.string().min(1, 'La ville est obligatoire'),
  pays: z.string().default('France'),
  email_contact: z.string().email('Email invalide'),
  telephone: z.string().nullish(),
  logo_url: z.string().nullish(),
  banque_nom: z.string().nullish(),
  banque_iban: z.string().nullish(),
  banque_bic: z.string().nullish(),
  mentions_legales: z.string().nullish(),
  conditions_reglement_default: z.string().nullish(),
  validite_devis_jours: z.number().int().positive().default(90),
  odoo_company_id: z.number().int().nullish(),
  odoo_journal_id: z.number().int().nullish(),
  est_defaut: z.boolean().default(false),
});

export type SocieteEmettriceInput = z.input<typeof SocieteEmettriceSchema>;

export async function createSocieteEmettrice(
  input: SocieteEmettriceInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }

  const parsed = SocieteEmettriceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('societes_emettrices')
    .insert({ ...parsed.data, actif: true })
    .select('id')
    .single();

  if (error) {
    logger.error('actions.societes_emettrices', 'create failed', { error });
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'societe_emettrice_created',
    table_name: 'societes_emettrices',
    row_id: data.id,
    metadata: {
      code: parsed.data.code,
      raison_sociale: parsed.data.raison_sociale,
    },
  });

  revalidatePath('/admin/parametres/societes-emettrices');
  return { success: true, id: data.id };
}

export async function updateSocieteEmettrice(
  id: string,
  input: Partial<SocieteEmettriceInput>,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }

  // Schema partiel pour update (tous les champs deviennent optionnels)
  const Partial = SocieteEmettriceSchema.partial();
  const parsed = Partial.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('societes_emettrices')
    .update(parsed.data)
    .eq('id', id);

  if (error) {
    logger.error('actions.societes_emettrices', 'update failed', { id, error });
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'societe_emettrice_updated',
    table_name: 'societes_emettrices',
    row_id: id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  revalidatePath('/admin/parametres/societes-emettrices');
  revalidatePath(`/admin/parametres/societes-emettrices/${id}`);
  return { success: true };
}

export async function archiveSocieteEmettrice(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return updateSocieteEmettrice(id, {
    /* @ts-expect-error actif n'est pas dans le schema input */ actif: false,
  });
}
```

- [ ] **Step 4.4: Run tests pass**

```bash
npm test -- societe-emettrice-actions
```

Expected : 2 tests pass.

- [ ] **Step 4.5: Verifier que `logAudit` et `isAdmin` existent bien aux paths cites**

```bash
grep -l "export.*logAudit\|export.*async function logAudit" lib/ -r
grep -l "export.*isAdmin" lib/utils/roles.ts
```

Expected : `lib/utils/audit.ts` ou similaire exporte `logAudit` ; `lib/utils/roles.ts` exporte `isAdmin`. Si les paths different, ajuster les imports en consequence (voir conventions du repo).

- [ ] **Step 4.6: Adapter `archiveSocieteEmettrice` proprement**

Le hack `@ts-expect-error` ci-dessus est laid. Refacto inline : ajouter `actif: z.boolean().optional()` au Schema en l'extendant uniquement pour update, ou simplifier en passant directement par supabase.update sans validation Zod.

Solution simple, remplacer le corps de `archiveSocieteEmettrice` :

```ts
export async function archiveSocieteEmettrice(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    return { success: false, error: 'Acces refuse (admin requis)' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('societes_emettrices')
    .update({ actif: false })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAudit({
    action: 'societe_emettrice_archived',
    table_name: 'societes_emettrices',
    row_id: id,
  });
  revalidatePath('/admin/parametres/societes-emettrices');
  return { success: true };
}
```

Re-run `npm test -- societe-emettrice-actions` : expected toujours 2 pass.

- [ ] **Step 4.7: Commit**

```bash
git add lib/actions/societes-emettrices.ts __tests__/societe-emettrice-actions.test.ts
git commit -m "feat(actions): CRUD societes emettrices avec audit log

Server actions admin-only (Zod validation + audit). Create / update /
archive. Couvre Task 4 du plan Phase 1 devis."
```

---

## Task 5 : Pages admin /admin/parametres/societes-emettrices

**Files:**

- Create: `app/(dashboard)/admin/parametres/societes-emettrices/page.tsx`
- Create: `app/(dashboard)/admin/parametres/societes-emettrices/nouvelle/page.tsx`
- Create: `app/(dashboard)/admin/parametres/societes-emettrices/[id]/page.tsx`
- Create: `components/admin/societe-emettrice-form.tsx`

- [ ] **Step 5.1: Liste page (server component)**

Path : `app/(dashboard)/admin/parametres/societes-emettrices/page.tsx`

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listSocietesEmettrices } from '@/lib/queries/societes-emettrices';

export const metadata: Metadata = { title: 'Societes emettrices - SOLUVIA' };

export default async function SocietesEmettricesPage() {
  const [user, societes] = await Promise.all([
    getCurrentUser(),
    listSocietesEmettrices(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Societes emettrices"
        description="Entites juridiques qui emettent devis et factures"
        actions={
          <Button asChild>
            <Link href="/admin/parametres/societes-emettrices/nouvelle">
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle societe
            </Link>
          </Button>
        }
      />

      <div className="bg-card rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Raison sociale</th>
              <th className="px-4 py-2">SIRET</th>
              <th className="px-4 py-2">Defaut</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Odoo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {societes.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono font-semibold">{s.code}</td>
                <td className="px-4 py-2">{s.raison_sociale}</td>
                <td className="px-4 py-2 font-mono text-xs">{s.siret}</td>
                <td className="px-4 py-2">{s.est_defaut ? 'Oui' : '-'}</td>
                <td className="px-4 py-2">{s.actif ? 'Oui' : 'Archivee'}</td>
                <td className="px-4 py-2 text-xs">
                  {s.odoo_company_id
                    ? `company=${s.odoo_company_id}`
                    : 'Non configure'}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/parametres/societes-emettrices/${s.id}`}
                    className="text-primary hover:underline"
                  >
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Formulaire reutilisable (client component)**

Path : `components/admin/societe-emettrice-form.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  createSocieteEmettrice,
  updateSocieteEmettrice,
  type SocieteEmettriceInput,
} from '@/lib/actions/societes-emettrices';
import type { SocieteEmettriceRow } from '@/lib/queries/societes-emettrices';

interface Props {
  societe?: SocieteEmettriceRow;
}

export function SocieteEmettriceForm({ societe }: Props) {
  const router = useRouter();
  const [isSubmitting, startSubmit] = useTransition();
  const [form, setForm] = useState<Partial<SocieteEmettriceInput>>({
    code: societe?.code ?? '',
    raison_sociale: societe?.raison_sociale ?? '',
    forme_juridique: societe?.forme_juridique ?? '',
    siret: societe?.siret ?? '',
    tva_intracom: societe?.tva_intracom ?? '',
    adresse: societe?.adresse ?? '',
    code_postal: societe?.code_postal ?? '',
    ville: societe?.ville ?? '',
    pays: societe?.pays ?? 'France',
    email_contact: societe?.email_contact ?? '',
    telephone: societe?.telephone ?? '',
    banque_nom: societe?.banque_nom ?? '',
    banque_iban: societe?.banque_iban ?? '',
    banque_bic: societe?.banque_bic ?? '',
    mentions_legales: societe?.mentions_legales ?? '',
    conditions_reglement_default: societe?.conditions_reglement_default ?? '',
    validite_devis_jours: societe?.validite_devis_jours ?? 90,
    est_defaut: societe?.est_defaut ?? false,
  });

  function set<K extends keyof SocieteEmettriceInput>(
    k: K,
    v: SocieteEmettriceInput[K],
  ) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit() {
    startSubmit(async () => {
      const res = societe
        ? await updateSocieteEmettrice(societe.id, form)
        : await createSocieteEmettrice(form as SocieteEmettriceInput);
      if (res.success) {
        toast.success(societe ? 'Societe mise a jour' : 'Societe creee');
        router.push('/admin/parametres/societes-emettrices');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Identite</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="code">Code (3 lettres)</Label>
            <Input
              id="code"
              value={form.code ?? ''}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
          <div>
            <Label htmlFor="forme">Forme juridique</Label>
            <Input
              id="forme"
              value={form.forme_juridique ?? ''}
              onChange={(e) => set('forme_juridique', e.target.value)}
              placeholder="S.A.S."
            />
          </div>
        </div>
        <div>
          <Label htmlFor="raison">Raison sociale</Label>
          <Input
            id="raison"
            value={form.raison_sociale ?? ''}
            onChange={(e) => set('raison_sociale', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              value={form.siret ?? ''}
              onChange={(e) => set('siret', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="tva">TVA intracom</Label>
            <Input
              id="tva"
              value={form.tva_intracom ?? ''}
              onChange={(e) => set('tva_intracom', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Adresse</legend>
        <Input
          value={form.adresse ?? ''}
          onChange={(e) => set('adresse', e.target.value)}
          placeholder="27 Rue Jacqueline Cochran"
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            value={form.code_postal ?? ''}
            onChange={(e) => set('code_postal', e.target.value)}
            placeholder="79000"
          />
          <Input
            value={form.ville ?? ''}
            onChange={(e) => set('ville', e.target.value)}
            placeholder="Niort"
          />
          <Input
            value={form.pays ?? ''}
            onChange={(e) => set('pays', e.target.value)}
            placeholder="France"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Contact</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            value={form.email_contact ?? ''}
            onChange={(e) => set('email_contact', e.target.value)}
            placeholder="contact@..."
          />
          <Input
            value={form.telephone ?? ''}
            onChange={(e) => set('telephone', e.target.value)}
            placeholder="Telephone"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Banque</legend>
        <Input
          value={form.banque_nom ?? ''}
          onChange={(e) => set('banque_nom', e.target.value)}
          placeholder="Nom banque"
        />
        <Input
          value={form.banque_iban ?? ''}
          onChange={(e) => set('banque_iban', e.target.value)}
          placeholder="IBAN"
          className="font-mono"
        />
        <Input
          value={form.banque_bic ?? ''}
          onChange={(e) => set('banque_bic', e.target.value)}
          placeholder="BIC"
          className="font-mono"
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">PDF / devis</legend>
        <div>
          <Label>Mentions legales (footer PDF)</Label>
          <Textarea
            value={form.mentions_legales ?? ''}
            onChange={(e) => set('mentions_legales', e.target.value)}
            rows={2}
          />
        </div>
        <div>
          <Label>Conditions de reglement par defaut</Label>
          <Textarea
            value={form.conditions_reglement_default ?? ''}
            onChange={(e) =>
              set('conditions_reglement_default', e.target.value)
            }
            rows={3}
          />
        </div>
        <div>
          <Label>Validite devis (jours)</Label>
          <Input
            type="number"
            value={form.validite_devis_jours ?? 90}
            onChange={(e) =>
              set('validite_devis_jours', Number(e.target.value))
            }
            className="w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="defaut"
            checked={form.est_defaut ?? false}
            onCheckedChange={(c) => set('est_defaut', c === true)}
          />
          <Label htmlFor="defaut">
            Societe par defaut (utilisee si une seule active)
          </Label>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {societe ? 'Enregistrer' : 'Creer'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.3: Page nouvelle societe**

Path : `app/(dashboard)/admin/parametres/societes-emettrices/nouvelle/page.tsx`

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { SocieteEmettriceForm } from '@/components/admin/societe-emettrice-form';

export const metadata: Metadata = { title: 'Nouvelle societe - SOLUVIA' };

export default async function NouvelleSocietePage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Nouvelle societe emettrice"
        description="Entite juridique qui emettra devis et factures"
      />
      <SocieteEmettriceForm />
    </div>
  );
}
```

- [ ] **Step 5.4: Page edit**

Path : `app/(dashboard)/admin/parametres/societes-emettrices/[id]/page.tsx`

```tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getSocieteEmettriceById } from '@/lib/queries/societes-emettrices';
import { SocieteEmettriceForm } from '@/components/admin/societe-emettrice-form';

export const metadata: Metadata = { title: 'Societe emettrice - SOLUVIA' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSocietePage({ params }: PageProps) {
  const { id } = await params;
  const [user, societe] = await Promise.all([
    getCurrentUser(),
    getSocieteEmettriceById(id),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');
  if (!societe) notFound();

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={`${societe.raison_sociale} (${societe.code})`}
        description="Modification des informations societe emettrice"
      />
      <SocieteEmettriceForm societe={societe} />
    </div>
  );
}
```

- [ ] **Step 5.5: Ajouter lien depuis /admin/parametres**

Modifier `app/(dashboard)/admin/parametres/page.tsx` pour ajouter une carte "Societes emettrices" pointant vers `/admin/parametres/societes-emettrices`. L'emplacement exact depend du JSX existant : situer apres la section "Entreprise" ou "Facturation".

```tsx
// Dans le JSX de retour, ajouter une carte :
<Link
  href="/admin/parametres/societes-emettrices"
  className="hover:bg-muted/40 block rounded-md border p-4"
>
  <h3 className="font-semibold">Societes emettrices</h3>
  <p className="text-muted-foreground text-sm">
    Gerer SOLUVIA, DIGIVIA et les autres entites juridiques.
  </p>
</Link>
```

- [ ] **Step 5.6: Verifier compile + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected : 0 erreur (sauf les regressions post Task 2 sur les Insert facture qui seront corrigees Task 6).

- [ ] **Step 5.7: Test manuel dev**

```bash
npm run dev
```

Aller sur http://localhost:3000/admin/parametres/societes-emettrices (admin connecte). Verifier :

- Liste affiche SOLUVIA en defaut.
- Bouton "Nouvelle societe" -> formulaire vide.
- Modifier SOLUVIA -> champs prefilles, sauvegarde OK.

- [ ] **Step 5.8: Commit**

```bash
git add app/\(dashboard\)/admin/parametres/societes-emettrices \
        components/admin/societe-emettrice-form.tsx \
        app/\(dashboard\)/admin/parametres/page.tsx
git commit -m "feat(admin): page CRUD societes emettrices

Liste + form create + form edit. Sections collapsibles identite,
adresse, contact, banque, PDF/devis. Admin only via isAdmin gate."
```

---

## Task 6 : Refacto getEmetteurInfo() pour lire depuis societes_emettrices

**Files:**

- Modify: `lib/queries/parametres.ts:106-135`

- [ ] **Step 6.1: Adapter `getEmetteurInfo()` pour accepter un `societeId` optionnel**

Path : `lib/queries/parametres.ts`

Remplacer le corps de `getEmetteurInfo()` (lignes 106-135) :

```ts
export async function getEmetteurInfo(
  societeId?: string | null,
): Promise<EmetteurInfo> {
  try {
    const supabase = await createClient();
    let query = supabase.from('societes_emettrices').select('*').limit(1);
    if (societeId) {
      query = query.eq('id', societeId);
    } else {
      query = query.eq('est_defaut', true).eq('actif', true);
    }
    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      logger.warn('queries.parametres', 'getEmetteurInfo fallback used', {
        societeId,
        error: error?.message,
      });
      return EMETTEUR_FALLBACK;
    }

    return {
      raison_sociale: data.raison_sociale,
      adresse: `${data.adresse}, ${data.code_postal} ${data.ville}`,
      siret: data.siret,
      tva: data.tva_intracom,
      iban: data.banque_iban,
      bic: data.banque_bic,
      banque: data.banque_nom,
      titulaire_compte: data.raison_sociale,
    };
  } catch (err) {
    logger.warn('queries.parametres', 'getEmetteurInfo fallback used', {
      error: err instanceof Error ? err.message : String(err),
    });
    return EMETTEUR_FALLBACK;
  }
}
```

- [ ] **Step 6.2: Verifier que tous les appelants existants compilent toujours**

Les appelants (`grep -rn 'getEmetteurInfo' lib/ app/ components/`) appellent sans argument -> compatibilite preservee (le parametre est optionnel).

```bash
grep -rn "getEmetteurInfo" lib/ app/ components/
```

Expected : ~7 fichiers, tous appellent `getEmetteurInfo()` sans arg.

- [ ] **Step 6.3: Adapter les routes API PDF pour resoudre la societe via la facture**

Path : `app/api/factures/[ref]/pdf/route.ts`

Avant l'appel `getEmetteurInfo()`, recuperer `facture.societe_emettrice_id` depuis le detail facture, et passer en argument :

```ts
const emetteur = await getEmetteurInfo(facture.societe_emettrice_id);
```

Faire de meme dans :

- `app/api/factures/brouillon/[id]/pdf/route.ts`
- `app/api/echeances/[id]/pdf-preview/route.ts`
- `app/api/echeances/[id]/preview-data/route.ts`

Pour chacun, identifier la variable facture (ou facture-equivalent) et y lire `societe_emettrice_id`.

- [ ] **Step 6.4: Verifier que FactureDetail expose societe_emettrice_id**

```bash
grep -n "societe_emettrice_id" lib/queries/factures.ts
```

Si pas present, ajouter `societe_emettrice_id` au `select()` de `getFactureDetail` (et son type Row Pick).

- [ ] **Step 6.5: Typecheck**

```bash
npx tsc --noEmit
```

Expected : 0 erreur (les Insert factures sans societe_emettrice_id sont gerees Task 7, pas Task 6 qui touche getEmetteurInfo seulement).

- [ ] **Step 6.6: Test manuel rendu PDF**

```bash
npm run dev
```

Naviguer sur une facture existante en prod-like (ex `/facturation/FAC-DUP-0001`), telecharger le PDF. Verifier que l'identite SOLUVIA est bien la (raison sociale, SIRET, IBAN). Le PDF doit etre identique a avant la migration.

- [ ] **Step 6.7: Commit**

```bash
git add lib/queries/parametres.ts \
        app/api/factures/\[ref\]/pdf/route.ts \
        app/api/factures/brouillon/\[id\]/pdf/route.ts \
        app/api/echeances/\[id\]/pdf-preview/route.ts \
        app/api/echeances/\[id\]/preview-data/route.ts \
        lib/queries/factures.ts
git commit -m "refactor(emetteur): getEmetteurInfo lit depuis societes_emettrices

Signature etendue avec parametre optionnel societeId. Sans arg = societe
par defaut active. Les routes PDF passent facture.societe_emettrice_id.
Fallback inchange. Identite PDF iso pour les factures existantes."
```

---

## Task 7 : Finaliser new-facture-libre-dialog (selecteur societe)

**Files:**

- Modify: `components/facturation/new-facture-libre-dialog.tsx`
- Modify: `lib/actions/factures/brouillons.ts:1100-1170` (`createFreeBrouillon`)
- Modify: `app/(dashboard)/facturation/page.tsx` (passer societes au dialog wrapper)
- Create: `__tests__/new-facture-libre-dialog.test.tsx`

- [ ] **Step 7.1: Ecrire le test failing (selecteur societe et submit avec societeId)**

Path : `__tests__/new-facture-libre-dialog.test.tsx`

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const createFreeBrouillonMock = vi.fn(async () => ({
  success: true as const,
  ref: 'FAC-AAA-0001',
}));
vi.mock('@/lib/actions/factures', () => ({
  createFreeBrouillon: (...args: unknown[]) =>
    createFreeBrouillonMock(
      ...(args as Parameters<typeof createFreeBrouillonMock>),
    ),
}));

import { NewFactureLibreDialog } from '@/components/facturation/new-facture-libre-dialog';

beforeEach(() => {
  createFreeBrouillonMock.mockClear();
});

describe('NewFactureLibreDialog', () => {
  const clients = [
    { id: 'c1', trigramme: 'DUP', raison_sociale: 'Dupont SARL' },
  ];
  const societes = [
    {
      id: 'sol-id',
      code: 'SOL',
      raison_sociale: 'S.A.S. SOLUVIA',
      est_defaut: true,
    },
    { id: 'dig-id', code: 'DIG', raison_sociale: 'DIGIVIA', est_defaut: false },
  ];

  it('selectionne la societe par defaut au montage', () => {
    render(
      <NewFactureLibreDialog
        open
        onOpenChange={() => {}}
        clients={clients}
        societes={societes}
      />,
    );
    // Le selecteur affiche SOL par defaut
    expect(screen.getByText(/S\.A\.S\. SOLUVIA/)).toBeInTheDocument();
  });

  it('submit avec societeEmettriceId', async () => {
    render(
      <NewFactureLibreDialog
        open
        onOpenChange={() => {}}
        clients={clients}
        societes={societes}
      />,
    );

    // Choix client
    fireEvent.click(screen.getByText('Dupont SARL'));
    // Saisie ligne
    fireEvent.change(screen.getByPlaceholderText(/Description ligne 1/), {
      target: { value: 'Audit' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Montant HT/), {
      target: { value: '500' },
    });
    // Submit
    fireEvent.click(screen.getByText(/Preparer le brouillon/));

    // wait microtask
    await new Promise((r) => setTimeout(r, 0));

    expect(createFreeBrouillonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'c1',
        societeEmettriceId: 'sol-id',
        lignes: [{ description: 'Audit', montantHt: 500 }],
      }),
    );
  });
});
```

- [ ] **Step 7.2: Run test (FAIL)**

```bash
npm test -- new-facture-libre-dialog
```

Expected : FAIL (le prop `societes` n'existe pas, le submit n'envoie pas `societeEmettriceId`).

- [ ] **Step 7.3: Mettre a jour le dialog**

Path : `components/facturation/new-facture-libre-dialog.tsx`

Modifications :

1. Ajouter l'import :

```ts
import { useEffect, useMemo, useState, useTransition } from 'react';
```

2. Etendre l'interface `NewFactureLibreDialogProps` :

```ts
export interface SocieteOption {
  id: string;
  code: string;
  raison_sociale: string;
  est_defaut: boolean;
}

interface NewFactureLibreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: FreeFactureClientOption[];
  societes: SocieteOption[];
}
```

3. Ajouter le state `societeId` avec init au default :

```ts
const defaultSociete = societes.find((s) => s.est_defaut) ?? societes[0];
const [societeId, setSocieteId] = useState<string>(defaultSociete?.id ?? '');
```

4. Etendre `canSubmit` :

```ts
const canSubmit =
  !!clientId &&
  !!societeId &&
  lignes.length > 0 &&
  lignes.every(
    (l) =>
      l.description.trim().length > 0 &&
      Number(l.montantHt.replace(',', '.')) > 0,
  );
```

5. Adapter `handleSubmit` :

```ts
const result = await createFreeBrouillon({
  clientId,
  societeEmettriceId: societeId,
  lignes: lignes.map((l) => ({
    description: l.description.trim(),
    montantHt: Number(l.montantHt.replace(',', '.')),
  })),
});
```

6. Ajouter un selecteur societe AVANT le selecteur client (entre `<div className="flex min-h-0 ...">` et `{/* Step 1 : choix client */}`) :

```tsx
{
  /* Step 0 : choix societe emettrice */
}
{
  societes.length > 1 && (
    <div className="space-y-2">
      <Label htmlFor="societe">Societe emettrice</Label>
      <select
        id="societe"
        value={societeId}
        onChange={(e) => setSocieteId(e.target.value)}
        className="bg-background w-full rounded-md border px-3 py-2 text-sm"
      >
        {societes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} - {s.raison_sociale}
          </option>
        ))}
      </select>
    </div>
  );
}
{
  societes.length === 1 && (
    <p className="text-muted-foreground text-xs">
      Emise depuis : <strong>{defaultSociete?.raison_sociale}</strong>
    </p>
  );
}
```

7. Reset incluant societeId :

```ts
function reset() {
  setClientId('');
  setSearch('');
  setLignes([emptyLigne()]);
  setSocieteId(defaultSociete?.id ?? '');
}
```

- [ ] **Step 7.4: Mettre a jour createFreeBrouillon (server action)**

Path : `lib/actions/factures/brouillons.ts` autour de la ligne 1100.

Lire le code actuel autour de `createFreeBrouillon` (`grep -n createFreeBrouillon lib/actions/factures/brouillons.ts`), puis :

1. Ajouter `societeEmettriceId: string` aux params de l'action :

```ts
export async function createFreeBrouillon(params: {
  clientId: string;
  societeEmettriceId: string;
  lignes: { description: string; montantHt: number }[];
}): Promise<{ success: true; ref: string | null } | { success: false; error: string }> {
```

2. Persister `societe_emettrice_id` dans l'insert :

```ts
const { data: facture, error } = await supabase
  .from('factures')
  .insert({
    client_id: clientId,
    societe_emettrice_id: societeEmettriceId,
    statut: 'a_emettre',
    montant_ht: ...,
    montant_tva: ...,
    montant_ttc: ...,
    taux_tva: 20,
    est_avoir: false,
    // pas de projet_id, pas de devis_id
  })
  .select('id, ref')
  .single();
```

(Adapter selon la structure exacte du code actuel.)

- [ ] **Step 7.5: Charger la liste des societes dans le wrapper qui ouvre le dialog**

Trouver le composant qui rend `NewFactureLibreDialog` (`grep -rn 'NewFactureLibreDialog' app/ components/`). C'est probablement `components/facturation/facturation-page-client.tsx`. Identifier ou les props sont passees.

Ajouter `societes` aux props que la page server passe au client component :

`app/(dashboard)/facturation/page.tsx` :

```ts
import { listSocietesEmettricesActives } from '@/lib/queries/societes-emettrices';
// ...
const [..., societes] = await Promise.all([
  // ...autres queries existantes,
  listSocietesEmettricesActives(),
]);

return (
  <FacturationPageClient
    // ...autres props,
    societes={societes.map((s) => ({
      id: s.id,
      code: s.code,
      raison_sociale: s.raison_sociale,
      est_defaut: s.est_defaut,
    }))}
  />
);
```

Et propager `societes` jusqu'au composant qui rend `NewFactureLibreDialog`.

- [ ] **Step 7.6: Run test PASS**

```bash
npm test -- new-facture-libre-dialog
```

Expected : 2 tests pass.

- [ ] **Step 7.7: Typecheck + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected : 0 erreur.

- [ ] **Step 7.8: Test manuel dev**

```bash
npm run dev
```

Aller sur /facturation, cliquer "Nouvelle facture libre" :

- Selecteur societe affiche SOLUVIA en defaut (texte simple car une seule societe).
- Choisir un client, saisir une ligne, valider.
- Verifier dans Supabase Studio que la facture cree a `societe_emettrice_id` rempli.

- [ ] **Step 7.9: Commit**

```bash
git add components/facturation/new-facture-libre-dialog.tsx \
        lib/actions/factures/brouillons.ts \
        app/\(dashboard\)/facturation/page.tsx \
        components/facturation/facturation-page-client.tsx \
        __tests__/new-facture-libre-dialog.test.tsx
git commit -m "feat(facture-libre): selecteur societe emettrice + persist

Le dialog facture libre accepte la liste des societes actives et
selectionne par defaut la societe marquee est_defaut. createFreeBrouillon
persiste societe_emettrice_id. Test Vitest sur le selecteur."
```

---

## Task 8 : Badge "Libre" dans la liste factures

**Files:**

- Modify: `components/facturation/facture-list-columns.tsx` (ou equivalent)

- [ ] **Step 8.1: Identifier le fichier des colonnes**

```bash
grep -l "type.*Libre\|projet_id.*null\|Facture libre" components/facturation/ -r
```

C'est probablement `components/facturation/facture-list-columns.tsx`.

- [ ] **Step 8.2: Ajouter une colonne / un badge "Type"**

Dans `facture-list-columns.tsx`, ajouter une cellule ou un badge inline qui affiche :

- "Projet" si `projet_id` non null.
- "Libre" si `projet_id` null.
- "Devis" plus tard en Phase 3 (placeholder commente pour eviter de re-toucher en Phase 3).

```tsx
function FactureTypeBadge({
  facture,
}: {
  facture: { projet_id: string | null };
}) {
  const type = facture.projet_id ? 'Projet' : 'Libre';
  const variant = type === 'Libre' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{type}</Badge>;
}
```

Et l'ajouter dans la definition des colonnes (entre `client` et `montant_ttc` par exemple).

- [ ] **Step 8.3: Lint + test visuel**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

Aller sur /facturation, verifier qu'il y a un badge Projet ou Libre sur chaque ligne.

- [ ] **Step 8.4: Commit**

```bash
git add components/facturation/facture-list-columns.tsx
git commit -m "feat(facture-list): badge Type (Projet | Libre)

Premiere etape Phase 1, le badge Devis viendra en Phase 3 quand le
champ devis_id sera ajoute."
```

---

## Task 9 : Wrap-up - tests complets, build, lint, regen types

- [ ] **Step 9.1: Reset et reapplique toutes les migrations**

```bash
npx supabase db reset
```

Expected : reset OK, toutes migrations 1..N appliquees sans erreur.

- [ ] **Step 9.2: Tous les tests pgTAP**

```bash
npx supabase test db
```

Expected : 8 tests passing (les 6 initiaux + 07 + 08).

- [ ] **Step 9.3: Tous les tests Vitest**

```bash
npm test
```

Expected : 100% pass, aucun nouveau test casse.

- [ ] **Step 9.4: Build prod**

```bash
npm run build
```

Expected : build OK, pas d'erreur TS.

- [ ] **Step 9.5: Lint**

```bash
npm run lint
```

Expected : 0 warning, 0 error.

- [ ] **Step 9.6: Verifier Vercel preview**

Push la branche. Verifier que Vercel build le preview sans erreur. Ne pas merger main tant que le test manuel de bout en bout (creation facture libre + PDF rendu) n'a pas ete fait sur la preview.

```bash
git push -u origin <branche>
```

Suivre le statut sur Vercel. Test manuel sur l'URL de preview :

1. Login admin.
2. /admin/parametres/societes-emettrices : voir SOLUVIA.
3. /facturation > Nouvelle facture libre : creer un brouillon test, envoyer en email a soi-meme, telecharger le PDF, verifier identite SOLUVIA correcte.
4. Verifier qu'aucune regression n'apparait sur les factures existantes (FAC-DUP-0042 etc.).

- [ ] **Step 9.7: Memoire de progress**

Mettre a jour ou creer une memoire :

```
Path : ~/.claude/projects/-Users-nael-Desktop-SOLUVIAV2/memory/project_progress.md
Snapshot 2026-05-22 - Phase 1 devis livree
- Table societes_emettrices + seed SOL
- factures.societe_emettrice_id NOT NULL apres backfill SOL
- UI admin CRUD societes emettrices
- Dialog facture libre : selecteur societe + persist
- PDF dynamique sur societe (getEmetteurInfo etendu)
Phase 2 (devis + portail public) prochaine.
```

- [ ] **Step 9.8: Final commit + PR**

Si tout est vert, ouvrir la PR vers main avec un titre clair :

```bash
gh pr create --title "Phase 1 - Socle multi-societe + factures libres" --body "$(cat <<'EOF'
## Summary
- Table societes_emettrices (seed SOLUVIA, est_defaut = TRUE)
- factures.societe_emettrice_id NOT NULL + backfill SOL
- UI admin CRUD societes emettrices (admin/superadmin)
- Dialog facture libre : selecteur societe + persistence
- PDF/email dynamiques sur la societe emettrice
- 8 tests pgTAP, tests Vitest dialog + actions

## Spec
docs/superpowers/specs/2026-05-22-devis-workflow-design.md (section 13 Phase 1)

## Test plan
- [ ] /admin/parametres/societes-emettrices : SOLUVIA visible, edit OK
- [ ] /facturation > Nouvelle facture libre : creation OK, brouillon visible
- [ ] PDF d une facture existante (FAC-DUP-xxxx) : identite SOLUVIA inchangee
- [ ] PDF d une facture libre nouvelle : identite SOLUVIA correcte
- [ ] Aucune regression sur factures projet existantes
EOF
)"
```

---

## Self-Review (post-redaction, a executer mentalement avant lancement)

### Spec coverage

| Section spec                      | Task plan                                                    |
| --------------------------------- | ------------------------------------------------------------ |
| 4.1 societes_emettrices           | Task 1                                                       |
| 4.3 factures.societe_emettrice_id | Task 2                                                       |
| 9 PDF par societe                 | Task 6                                                       |
| 13 Phase 1 facture libre          | Task 7                                                       |
| 13 Phase 1 page admin             | Task 5                                                       |
| Section 13 (trigger inchange)     | Task 2 (test pgTAP 08 verifie generate_facture_ref preserve) |

### Risques traites

- Backfill SOL idempotent : Task 2 step 2.2.
- RLS societes_emettrices : Task 1 step 1.4 (test pgTAP).
- Compatibilite getEmetteurInfo : Task 6 step 6.1 (parametre optionnel, fallback preserve).
- Permissions admin : Task 4 (action) + Task 5 (page) gates `isAdmin()`.

### Non-couvert en Phase 1 (par design)

- Numerotation par societe -> Phase 4.
- Migration des params entreprise/facturation vers societes_emettrices -> Phase 1 ne supprime pas la table parametres, le mapping est duplique pendant la transition. A nettoyer en Phase 4 si redondance confirmee.
- Devis et portail public -> Phase 2.
- Badge "Devis" sur factures -> Phase 3.

### Verifications post-execution avant merge

1. Tous les PDFs existants identiques visuellement a la prod (regression visuelle).
2. `npx supabase test db` 8/8 pass.
3. `npm test` 100% pass.
4. `npm run build` OK.
5. Vercel preview verte.
6. Test manuel : creer une facture libre, envoyer email, recevoir, ouvrir PDF.
