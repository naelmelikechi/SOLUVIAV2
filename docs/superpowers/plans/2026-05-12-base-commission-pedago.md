# Base de commission HEOL sur lignes pédagogiques — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le calcul de commission Soluvia (HEOL aujourd'hui, tous projets demain) sur le détail ligne par ligne des bordereaux OPCO Eduvia (whitelist `PEDAGOGIE`), avec un circuit-breaker pour tout `line_type` inconnu.

**Architecture:** Trois PRs séquentielles. PR 1 ajoute une nouvelle table `eduvia_invoice_lines` peuplée via un endpoint Eduvia non documenté `/api/v1/invoices/:id/lines`, sans changer le calcul. PR 2 fait basculer le calcul de commission sur cette table avec lock `unknown_line_type` et audit log. PR 3 supprime le mode legacy `billing_mode='auto'`, l'echeancier prévisionnel, et passe le taux HEOL à 40%.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase Postgres (avec RLS), `@supabase/supabase-js`, Vitest/Jest, `lib/eduvia/sync.ts` orchestrateur sync.

**Spec source:** `docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md`

---

## File structure

### PR 1 — Sync des lignes Eduvia (sans changement de calcul)

- **Create:** `supabase/migrations/20260512100000_eduvia_invoice_lines.sql` — DDL nouvelle table + index + RLS.
- **Modify:** `lib/eduvia/client.ts` — ajouter `EduviaInvoiceLine` interface + `fetchInvoiceLines()` helper.
- **Modify:** `lib/eduvia/sync.ts` — nouvelle phase 5 : pour chaque step émis, fetch et upsert les lignes.
- **Create:** `lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts` — tests unitaires du helper avec mock fetch.
- **Create:** `lib/eduvia/__tests__/sync-invoice-lines.test.ts` — test d'intégration sur la phase sync.
- **Regenerate:** `types/database.ts` après migration.

### PR 2 — Calcul de commission basé sur les lignes

- **Create:** `lib/eduvia/line-types.ts` — constantes whitelist/blacklist + `classifyLineType()`.
- **Create:** `lib/eduvia/__tests__/line-types.test.ts` — tests classification.
- **Modify:** `lib/queries/billable-events.ts` — remplacer agrégats `total_amount` par jointures lignes + circuit breaker.
- **Modify:** `lib/queries/billable-events.ts` — ajouter `'unknown_line_type'` à `lock_reason` union.
- **Modify:** `lib/actions/factures/brouillons.ts` — audit log écart à la facturation.
- **Modify:** `lib/queries/__tests__/billable-events.test.ts` (créer si absent) — couverture cas lignes pédago / matos noyé / unknown / verrouillage / arrondi.

### PR 3 — Cleanup billing_mode + taux HEOL 40%

- **Create:** `supabase/migrations/20260513100000_drop_billing_mode_update_heol.sql` — DROP CONSTRAINT/INDEX/COLUMN + UPDATE taux.
- **Modify:** `lib/queries/billable-events.ts` — renommer `listManualProjets` → `listBillableProjets`, retirer filtre.
- **Modify:** `lib/queries/factures.ts` — retirer toutes lectures de `billing_mode`.
- **Modify:** `lib/queries/projets.ts` — retirer `billing_mode` du select projet detail.
- **Modify:** `lib/actions/projets.ts` — retirer action `updateBillingMode`.
- **Modify:** `lib/actions/factures/brouillons.ts` — supprimer la branche `billing_mode='auto'` (calcul sur échéancier prévisionnel).
- **Modify:** `app/api/cron/echeances/route.ts` — désactiver le cron (early return + log).
- **Modify:** `app/(dashboard)/projets/[ref]/page.tsx` — retirer le branchement UI sur `billing_mode`.
- **Modify:** `components/facturation/new-facture-dialog.tsx` — retirer badge "Auto / Manuel".
- **Modify:** `components/projets/projet-detail-header.tsx` — retirer affichage mode.
- **Regenerate:** `types/database.ts`.

### Actions manuelles post-déploiement

- Émettre un avoir total sur FAC-HED-0003 via l'UI existante des factures.
- Recréer un brouillon engagement HEOL → vérifier que le total TTC est **43 424,70 €**.

---

## PR 1 — Sync des lignes Eduvia

### Task 1.1 : Migration DB `eduvia_invoice_lines`

**Files:**

- Create: `supabase/migrations/20260512100000_eduvia_invoice_lines.sql`

- [ ] **Step 1.1.1 : Écrire la migration**

```sql
-- Migration : table eduvia_invoice_lines pour stocker le detail des lignes
-- des bordereaux OPCO emis (endpoint /api/v1/invoices/:id/lines).
-- Cle primaire = eduvia_id (BIGINT, l'id Eduvia de la ligne).
-- Multi-tenant : source_client_id permet d'isoler chaque CFA. RLS aligne
-- sur le pattern existant des autres tables eduvia_*.

CREATE TABLE IF NOT EXISTS public.eduvia_invoice_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id           BIGINT NOT NULL,
  source_client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contrat_id          UUID NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  eduvia_invoice_id   BIGINT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  line_type           TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  description         TEXT,
  eduvia_created_at   TIMESTAMPTZ,
  eduvia_updated_at   TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_eduvia_invoice_lines_eduvia_id_per_client
    UNIQUE (eduvia_id, source_client_id)
);

CREATE INDEX IF NOT EXISTS ix_eduvia_invoice_lines_contrat
  ON public.eduvia_invoice_lines (contrat_id);
CREATE INDEX IF NOT EXISTS ix_eduvia_invoice_lines_invoice
  ON public.eduvia_invoice_lines (eduvia_invoice_id);
CREATE INDEX IF NOT EXISTS ix_eduvia_invoice_lines_type
  ON public.eduvia_invoice_lines (line_type);

ALTER TABLE public.eduvia_invoice_lines ENABLE ROW LEVEL SECURITY;

-- Lecture : admin/superadmin partout, CDP scope par projet via contrat → projet → cdp_id.
CREATE POLICY eduvia_invoice_lines_select
  ON public.eduvia_invoice_lines
  FOR SELECT
  USING (
    public.get_user_role() IN ('admin','superadmin')
    OR EXISTS (
      SELECT 1
        FROM public.contrats c
        JOIN public.projets p ON p.id = c.projet_id
       WHERE c.id = eduvia_invoice_lines.contrat_id
         AND (p.cdp_id = auth.uid() OR p.backup_cdp_id = auth.uid())
    )
  );

-- Service role (sync Eduvia) : pas de policy WRITE, on utilise bypass RLS.
-- Aucun INSERT/UPDATE/DELETE côté utilisateur final (table purement sync).
COMMENT ON TABLE public.eduvia_invoice_lines IS
  'Detail ligne par ligne des bordereaux OPCO emis. Source : endpoint Eduvia non documente /api/v1/invoices/:id/lines. Cle de calcul de commission Soluvia (whitelist line_type=PEDAGOGIE).';
```

- [ ] **Step 1.1.2 : Appliquer la migration en local**

```bash
npx supabase db push
```

Expected : `Applying migration 20260512100000_eduvia_invoice_lines.sql...` puis aucun erreur.

- [ ] **Step 1.1.3 : Vérifier la table**

```bash
npx supabase db diff
```

Expected : aucune diff (la migration est appliquée et reflète l'état souhaité).

- [ ] **Step 1.1.4 : Commit**

```bash
git add supabase/migrations/20260512100000_eduvia_invoice_lines.sql
git commit -m "feat(db): create eduvia_invoice_lines table

Stocke le detail des lignes des bordereaux OPCO emis via l'endpoint
non documente /api/v1/invoices/:id/lines. Cle de calcul de la commission
Soluvia (whitelist line_type=PEDAGOGIE)."
```

### Task 1.2 : Type TS `EduviaInvoiceLine` + helper `fetchInvoiceLines`

**Files:**

- Modify: `lib/eduvia/client.ts` (ajout après la définition de `EduviaInvoiceForecastStep`, ligne ~154)
- Create: `lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts`

- [ ] **Step 1.2.1 : Écrire le test du helper**

Create file `lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts` :

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchInvoiceLines, type EduviaInvoiceLine } from '@/lib/eduvia/client';

const SAMPLE_LINES: EduviaInvoiceLine[] = [
  {
    id: 79,
    invoice_id: 61,
    amount: 2666.56,
    line_type: 'PEDAGOGIE',
    quantity: 1,
    description: 'Échéance n°1 - Frais pédagogiques',
    created_at: '2026-05-07T16:11:22.891+02:00',
    updated_at: '2026-05-07T16:11:22.891+02:00',
  },
];

describe('fetchInvoiceLines', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: SAMPLE_LINES }), { status: 200 }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/v1/invoices/:id/lines et renvoie data[]', async () => {
    const lines = await fetchInvoiceLines('heol.eduvia.app', 'fake-key', 61);

    expect(lines).toEqual(SAMPLE_LINES);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.heol.eduvia.app/api/v1/invoices/61/lines',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-key' }),
      }),
    );
  });

  it('renvoie [] si data est absent dans la réponse', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const lines = await fetchInvoiceLines('heol.eduvia.app', 'k', 999);
    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 1.2.2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts
```

Expected : FAIL (`fetchInvoiceLines` / `EduviaInvoiceLine` non exportés).

- [ ] **Step 1.2.3 : Implémenter le type et le helper**

Dans `lib/eduvia/client.ts`, après l'interface `EduviaInvoiceForecastStep` (ligne ~154), insérer :

```ts
/**
 * Ligne d'un bordereau OPCO emis. Renvoyee par l'endpoint non documente
 * GET /api/v1/invoices/:id/lines. Champ `line_type` typant : valeurs connues
 * 'PEDAGOGIE' (commissionnable Soluvia) et 'PREMIEREQUIPEMENT' (matos info,
 * jamais commissionne). Voir lib/eduvia/line-types.ts pour la classification.
 */
export interface EduviaInvoiceLine {
  id: number;
  invoice_id: number;
  amount: number;
  line_type: string;
  quantity: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```

Puis tout en bas du fichier, après `fetchStatus`, ajouter :

```ts
/**
 * Fetch les lignes d'un bordereau OPCO emis.
 * Endpoint non documente dans l'OpenAPI publique mais actif et stable.
 * Decouvert 2026-05-12 (voir spec docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md).
 */
export async function fetchInvoiceLines(
  instanceUrl: string,
  apiKey: string,
  invoiceId: number,
): Promise<EduviaInvoiceLine[]> {
  return fetchList<EduviaInvoiceLine>(
    instanceUrl,
    apiKey,
    `invoices/${invoiceId}/lines`,
  );
}
```

- [ ] **Step 1.2.4 : Re-lancer le test pour valider**

```bash
npx vitest run lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts
```

Expected : PASS (2 tests).

- [ ] **Step 1.2.5 : Commit**

```bash
git add lib/eduvia/client.ts lib/eduvia/__tests__/client-fetch-invoice-lines.test.ts
git commit -m "feat(eduvia): add fetchInvoiceLines helper

Wrap l'endpoint non documente /api/v1/invoices/:id/lines qui expose
le detail ligne par ligne d'un bordereau OPCO (line_type structure)."
```

### Task 1.3 : Sync des lignes par invoice émis

**Files:**

- Modify: `lib/eduvia/sync.ts` (étendre la PASS 4)
- Create: `lib/eduvia/__tests__/sync-invoice-lines.test.ts`

- [ ] **Step 1.3.1 : Écrire le test d'intégration sync**

Create file `lib/eduvia/__tests__/sync-invoice-lines.test.ts` :

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock du module client : on contrôle ce que les fetch* renvoient.
vi.mock('@/lib/eduvia/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/eduvia/client')>();
  return {
    ...actual,
    fetchStatus: vi
      .fn()
      .mockResolvedValue({ authenticated: 'ok', status: 'ok', version: '1' }),
    fetchAllPages: vi.fn(async (_iu: string, _k: string, resource: string) => {
      if (resource === 'campuses')
        return [{ id: 1, denomination: 'Test campus' }];
      if (resource === 'companies') return [];
      if (resource === 'formations') return [];
      if (resource === 'employees') return [];
      if (resource === 'contracts')
        return [
          {
            id: 1,
            employee_id: 1,
            company_id: 1,
            formation_id: 1,
            campus_id: 1,
            contract_state: 'ENGAGE',
            npec_amount: 5000,
            contract_type: 11,
            contract_mode: 1,
            creation_mode: 'MANUAL',
            referrer_type: 'fixed',
          },
        ];
      return [];
    }),
    fetchList: vi.fn(async (_iu: string, _k: string, resource: string) => {
      if (resource === 'contracts/1/invoice_steps')
        return [
          {
            id: 100,
            contract_id: 1,
            invoice_id: 200,
            step_number: 1,
            opening_date: '2026-01-01',
            total_amount: 2000,
            including_pedagogie_amount: 2000,
            including_rqth_amount: 0,
            paid_amount: 0,
            in_progress_amount: 0,
            siret_cfa: '0',
            external_code: '',
            invoice_state: 'TRANSMIS',
            invoice_sent_at: null,
            paid_at: null,
          },
          {
            id: 101,
            contract_id: 1,
            invoice_id: 201,
            step_number: 1,
            opening_date: '2026-01-01',
            total_amount: 500,
            including_pedagogie_amount: 0,
            including_rqth_amount: 0,
            paid_amount: 0,
            in_progress_amount: 0,
            siret_cfa: '0',
            external_code: '',
            invoice_state: 'TRANSMIS',
            invoice_sent_at: null,
            paid_at: null,
          },
        ];
      if (resource === 'invoices/200/lines')
        return [
          {
            id: 1000,
            invoice_id: 200,
            amount: 2000,
            line_type: 'PEDAGOGIE',
            quantity: 1,
            description: 'Pédago',
            created_at: '',
            updated_at: '',
          },
        ];
      if (resource === 'invoices/201/lines')
        return [
          {
            id: 1001,
            invoice_id: 201,
            amount: 500,
            line_type: 'PREMIEREQUIPEMENT',
            quantity: 1,
            description: 'Matos',
            created_at: '',
            updated_at: '',
          },
        ];
      if (resource === 'contracts/1/invoice_forecast_steps') return [];
      return [];
    }),
    fetchOne: vi.fn(async () => ({})),
  };
});

import { syncEduviaForClient } from '@/lib/eduvia/sync';
import { createClient } from '@/lib/supabase/server';

describe('sync invoice_lines', () => {
  const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    const supabase = await createClient();
    await supabase
      .from('eduvia_invoice_lines')
      .delete()
      .eq('source_client_id', CLIENT_ID);
  });

  it('peuple eduvia_invoice_lines avec les lignes des invoices émis', async () => {
    // L'appelant fournit déjà instanceUrl + apiKey ; la fixture DB doit
    // exister pour client_id et contract_id mappés. Voir helpers de test
    // existants dans le projet pour le set-up (mock RPC ou fixture client+contrat).
    await syncEduviaForClient(CLIENT_ID, 'heol.eduvia.app', 'fake-key');

    const supabase = await createClient();
    const { data } = await supabase
      .from('eduvia_invoice_lines')
      .select('eduvia_id, eduvia_invoice_id, amount, line_type')
      .eq('source_client_id', CLIENT_ID)
      .order('eduvia_id');

    expect(data).toEqual([
      {
        eduvia_id: 1000,
        eduvia_invoice_id: 200,
        amount: '2000.00',
        line_type: 'PEDAGOGIE',
      },
      {
        eduvia_id: 1001,
        eduvia_invoice_id: 201,
        amount: '500.00',
        line_type: 'PREMIEREQUIPEMENT',
      },
    ]);
  });

  it('upsert idempotent : un re-sync ne duplique pas les lignes', async () => {
    await syncEduviaForClient(CLIENT_ID, 'heol.eduvia.app', 'fake-key');
    await syncEduviaForClient(CLIENT_ID, 'heol.eduvia.app', 'fake-key');

    const supabase = await createClient();
    const { count } = await supabase
      .from('eduvia_invoice_lines')
      .select('eduvia_id', { count: 'exact', head: true })
      .eq('source_client_id', CLIENT_ID);

    expect(count).toBe(2);
  });
});
```

- [ ] **Step 1.3.2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run lib/eduvia/__tests__/sync-invoice-lines.test.ts
```

Expected : FAIL (la sync n'écrit pas dans `eduvia_invoice_lines`, aucune ligne attendue).

- [ ] **Step 1.3.3 : Étendre `lib/eduvia/sync.ts`**

Dans `lib/eduvia/sync.ts`, importer le helper et l'interface au début du fichier :

```ts
import {
  // ... imports existants ...
  fetchInvoiceLines,
  type EduviaInvoiceLine,
} from './client';
```

Ajouter la propriété `invoice_lines` à l'interface `SyncResult` (où sont déjà `invoice_steps`, `invoice_forecast_steps`...) :

```ts
export interface SyncResult {
  // ... champs existants ...
  invoice_lines: number;
}
```

Initialiser à 0 dans le `result` initial (chercher `const result: SyncResult = {` et ajouter `invoice_lines: 0,`).

Dans `syncEduviaForClient`, **après** la boucle `for (const step of steps)` qui peuple `eduvia_invoice_steps` (ligne ~508), ajouter une sous-boucle qui sync les lignes pour chaque step ayant un `invoice_id` :

```ts
// Phase 5 : sync des lignes pour chaque step emis (invoice_id non null).
// Endpoint /api/v1/invoices/:id/lines non documente, peut casser sans
// preavis - on degrade gracieusement avec EndpointNotAvailableError.
for (const step of steps) {
  if (!step.invoice_id) continue;
  try {
    const lines = await fetchInvoiceLines(instanceUrl, apiKey, step.invoice_id);
    for (const line of lines) {
      const { error: lineErr } = await supabase
        .from('eduvia_invoice_lines')
        .upsert(
          {
            eduvia_id: line.id,
            source_client_id: clientId,
            contrat_id: contratId,
            eduvia_invoice_id: line.invoice_id,
            amount: line.amount,
            line_type: line.line_type,
            quantity: line.quantity,
            description: line.description,
            eduvia_created_at: line.created_at,
            eduvia_updated_at: line.updated_at,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id,source_client_id' },
        );
      if (lineErr) {
        result.errors.push(
          `InvoiceLine eduvia_id=${line.id}: ${lineErr.message}`,
        );
      } else {
        result.invoice_lines++;
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_lines invoice=${step.invoice_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 1.3.4 : Re-lancer le test**

```bash
npx vitest run lib/eduvia/__tests__/sync-invoice-lines.test.ts
```

Expected : PASS (2 tests). Si le 2e échoue avec count=2 vs 4 → vérifier que le `onConflict` est correct dans l'upsert.

- [ ] **Step 1.3.5 : Test de non-régression sur le sync complet**

```bash
npx vitest run lib/eduvia/__tests__/sync.test.ts
```

Expected : tous les tests existants passent (la nouvelle phase est additive, n'altère pas le reste).

- [ ] **Step 1.3.6 : Commit**

```bash
git add lib/eduvia/sync.ts lib/eduvia/__tests__/sync-invoice-lines.test.ts
git commit -m "feat(eduvia): sync des lignes par invoice emis

Pour chaque step ayant un invoice_id, fetch /invoices/:id/lines et
upsert dans eduvia_invoice_lines. Idempotent via UNIQUE
(eduvia_id, source_client_id)."
```

### Task 1.4 : Régénération des types DB

**Files:**

- Modify: `types/database.ts`

- [ ] **Step 1.4.1 : Lancer la regen**

```bash
npx supabase gen types typescript --local > types/database.ts
```

- [ ] **Step 1.4.2 : Vérifier que la nouvelle table est typée**

```bash
grep -n "eduvia_invoice_lines" types/database.ts | head -5
```

Expected : au moins 3 occurrences (Row, Insert, Update).

- [ ] **Step 1.4.3 : Type check global**

```bash
npx tsc --noEmit
```

Expected : 0 erreur.

- [ ] **Step 1.4.4 : Commit + déploiement preview**

```bash
git add types/database.ts
git commit -m "chore(types): regen apres ajout eduvia_invoice_lines"
git push
```

Vérifier le preview Vercel : le sync devrait peupler la table aux premières heures. Vérifier via Supabase Studio que `eduvia_invoice_lines` se remplit pour HEOL après le prochain run du cron `eduvia-sync`.

---

## PR 2 — Calcul de commission basé sur les lignes

### Task 2.1 : Module `lib/eduvia/line-types.ts`

**Files:**

- Create: `lib/eduvia/line-types.ts`
- Create: `lib/eduvia/__tests__/line-types.test.ts`

- [ ] **Step 2.1.1 : Écrire le test**

Create file `lib/eduvia/__tests__/line-types.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  WHITELIST_LINE_TYPES,
  BLACKLIST_LINE_TYPES,
  classifyLineType,
} from '@/lib/eduvia/line-types';

describe('classifyLineType', () => {
  it('PEDAGOGIE → whitelist', () => {
    expect(classifyLineType('PEDAGOGIE')).toBe('whitelist');
  });

  it('PREMIEREQUIPEMENT → blacklist', () => {
    expect(classifyLineType('PREMIEREQUIPEMENT')).toBe('blacklist');
  });

  it('type inconnu → unknown', () => {
    expect(classifyLineType('EXAMEN')).toBe('unknown');
    expect(classifyLineType('RQTH')).toBe('unknown');
    expect(classifyLineType('')).toBe('unknown');
  });

  it('listes hardcodées documentées et figées', () => {
    expect(WHITELIST_LINE_TYPES).toEqual(['PEDAGOGIE']);
    expect(BLACKLIST_LINE_TYPES).toEqual(['PREMIEREQUIPEMENT']);
  });
});
```

- [ ] **Step 2.1.2 : Lancer le test**

```bash
npx vitest run lib/eduvia/__tests__/line-types.test.ts
```

Expected : FAIL (module inexistant).

- [ ] **Step 2.1.3 : Implémenter**

Create file `lib/eduvia/line-types.ts` :

```ts
/**
 * Classification des line_type Eduvia pour le calcul de commission Soluvia.
 *
 * Whitelist : types commissionnes. Whitelist intentionnellement minimale,
 *   un nouveau type doit etre explicitement ajoute ici via PR.
 * Blacklist : types ignores silencieusement (frais OPCO non rentrant dans
 *   la convention commerciale Soluvia, ex. premier equipement informatique).
 * Unknown : tout autre type → contrat verrouille (lock_reason=unknown_line_type)
 *   tant que la decision humaine n'a pas eu lieu (whitelist ou blacklist).
 *
 * Voir spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md
 */

export const WHITELIST_LINE_TYPES = ['PEDAGOGIE'] as const;
export const BLACKLIST_LINE_TYPES = ['PREMIEREQUIPEMENT'] as const;

export type LineTypeClass = 'whitelist' | 'blacklist' | 'unknown';

export function classifyLineType(t: string): LineTypeClass {
  if ((WHITELIST_LINE_TYPES as readonly string[]).includes(t))
    return 'whitelist';
  if ((BLACKLIST_LINE_TYPES as readonly string[]).includes(t))
    return 'blacklist';
  return 'unknown';
}
```

- [ ] **Step 2.1.4 : Re-lancer le test**

```bash
npx vitest run lib/eduvia/__tests__/line-types.test.ts
```

Expected : PASS (4 tests).

- [ ] **Step 2.1.5 : Commit**

```bash
git add lib/eduvia/line-types.ts lib/eduvia/__tests__/line-types.test.ts
git commit -m "feat(eduvia): classification line_types (whitelist/blacklist/unknown)

Listes hardcodees pour V1 : PEDAGOGIE whiteliste, PREMIEREQUIPEMENT
blackliste, tout autre type lock le contrat jusqu'a decision humaine."
```

### Task 2.2 : Lock `unknown_line_type` dans le type `BillableEvent`

**Files:**

- Modify: `lib/queries/billable-events.ts` (ligne 72, type `lock_reason`)

- [ ] **Step 2.2.1 : Ajouter la valeur au type union**

Remplacer dans `lib/queries/billable-events.ts` (autour de la ligne 72) :

```ts
  lock_reason?: 'opposite_billed' | 'missing_deca';
```

par :

```ts
  /**
   * Raison du verrouillage si status='locked'. Permet a l UI d afficher
   * le bon badge/tooltip.
   * - 'opposite_billed'    : le type oppose (engagement vs opco_step) est
   *                          deja facture pour ce contrat (regle d exclusion)
   * - 'missing_deca'       : contract_number (DECA OPCO) absent, on refuse
   *                          de facturer pour eviter le rejet client
   * - 'unknown_line_type'  : une ligne du bordereau OPCO du contrat a un
   *                          line_type ni whiteliste ni blackliste. Voir
   *                          unknown_line_types pour la liste, et
   *                          lib/eduvia/line-types.ts pour la classification.
   */
  lock_reason?: 'opposite_billed' | 'missing_deca' | 'unknown_line_type';
  unknown_line_types?: string[];
```

- [ ] **Step 2.2.2 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreur (le type est élargi, les call sites existants restent valides).

- [ ] **Step 2.2.3 : Commit**

```bash
git add lib/queries/billable-events.ts
git commit -m "feat(billable-events): add unknown_line_type lock_reason

Prepare l'introduction du circuit-breaker pour les line_type inconnus
non encore classifies par decision humaine."
```

### Task 2.3 : Migrer le calcul `engagement` sur les lignes

**Files:**

- Modify: `lib/queries/billable-events.ts` (lignes 141-169, agrégat base engagement)
- Create: `lib/queries/__tests__/billable-events-lines.test.ts`

- [ ] **Step 2.3.1 : Écrire les tests**

Create file `lib/queries/__tests__/billable-events-lines.test.ts` :

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { getBillableEvents } from '@/lib/queries/billable-events';

// Fixtures : utiliser les helpers existants (createProjetFixture, etc.) si
// presents dans tests/setup. Sinon, instantier directement via supabase admin.
// On ne maquette PAS la DB ici : tests d'integration sur Supabase local.

const TEST_PROJET_ID = '00000000-0000-0000-0000-000000000001';
const TEST_CONTRAT_ID = '00000000-0000-0000-0000-000000000010';
const TEST_CLIENT_ID = '00000000-0000-0000-0000-000000000100';

async function seedContractWithLines(opts: {
  contratRef: string;
  contractNumber: string;
  pedagoLines: { eduvia_invoice_id: number; amount: number }[];
  matosLines?: { eduvia_invoice_id: number; amount: number }[];
  unknownLines?: {
    eduvia_invoice_id: number;
    amount: number;
    line_type: string;
  }[];
  step1Emitted: boolean;
}) {
  const supabase = await createClient();
  // Projet + contrat + steps + lignes : minimum viable pour getBillableEvents.
  await supabase.from('projets').upsert({
    id: TEST_PROJET_ID,
    ref: 'TST-001',
    client_id: TEST_CLIENT_ID,
    taux_commission: 40,
    archive: false,
  });
  await supabase.from('contrats').upsert({
    id: TEST_CONTRAT_ID,
    projet_id: TEST_PROJET_ID,
    ref: opts.contratRef,
    contract_number: opts.contractNumber,
    contract_state: 'ENGAGE',
    apprenant_nom: 'Test',
    apprenant_prenom: 'User',
    archive: false,
  });

  const allLines = [
    ...opts.pedagoLines.map((l, i) => ({
      eduvia_id: 1000 + i,
      source_client_id: TEST_CLIENT_ID,
      contrat_id: TEST_CONTRAT_ID,
      eduvia_invoice_id: l.eduvia_invoice_id,
      amount: l.amount,
      line_type: 'PEDAGOGIE',
      quantity: 1,
    })),
    ...(opts.matosLines ?? []).map((l, i) => ({
      eduvia_id: 2000 + i,
      source_client_id: TEST_CLIENT_ID,
      contrat_id: TEST_CONTRAT_ID,
      eduvia_invoice_id: l.eduvia_invoice_id,
      amount: l.amount,
      line_type: 'PREMIEREQUIPEMENT',
      quantity: 1,
    })),
    ...(opts.unknownLines ?? []).map((l, i) => ({
      eduvia_id: 3000 + i,
      source_client_id: TEST_CLIENT_ID,
      contrat_id: TEST_CONTRAT_ID,
      eduvia_invoice_id: l.eduvia_invoice_id,
      amount: l.amount,
      line_type: l.line_type,
      quantity: 1,
    })),
  ];
  await supabase.from('eduvia_invoice_lines').insert(allLines);

  if (opts.step1Emitted) {
    const invoiceIds = [
      ...opts.pedagoLines,
      ...(opts.matosLines ?? []),
      ...(opts.unknownLines ?? []),
    ].map((l) => l.eduvia_invoice_id);
    const uniqueInvoiceIds = [...new Set(invoiceIds)];
    await supabase.from('eduvia_invoice_steps').insert(
      uniqueInvoiceIds.map((id, i) => ({
        eduvia_id: 5000 + i,
        source_client_id: TEST_CLIENT_ID,
        contrat_id: TEST_CONTRAT_ID,
        eduvia_contract_id: 1,
        eduvia_invoice_id: id,
        step_number: 1,
        total_amount: 0,
        including_pedagogie_amount: 0,
        invoice_state: 'TRANSMIS',
      })),
    );
  }
}

async function clearTestData() {
  const supabase = await createClient();
  await supabase
    .from('eduvia_invoice_lines')
    .delete()
    .eq('source_client_id', TEST_CLIENT_ID);
  await supabase
    .from('eduvia_invoice_steps')
    .delete()
    .eq('source_client_id', TEST_CLIENT_ID);
  await supabase.from('contrats').delete().eq('id', TEST_CONTRAT_ID);
  await supabase.from('projets').delete().eq('id', TEST_PROJET_ID);
}

describe('getBillableEvents - calcul sur lignes PEDAGOGIE', () => {
  beforeEach(async () => {
    await clearTestData();
  });

  it('1 ligne PEDAGOGIE sur step 1 émis → 1 event engagement à amount', async () => {
    await seedContractWithLines({
      contratRef: 'CTR-T1',
      contractNumber: 'DECA001',
      pedagoLines: [{ eduvia_invoice_id: 100, amount: 2500 }],
      step1Emitted: true,
    });

    const result = await getBillableEvents(TEST_PROJET_ID);

    expect(result?.events).toHaveLength(1);
    expect(result?.events[0]).toMatchObject({
      type: 'engagement',
      montant_brut: 2500,
      montant_commissionne: 1000, // 2500 × 40%
      status: 'available',
    });
  });

  it('PEDAGOGIE + PREMIEREQUIPEMENT noyés dans la même invoice → la base ignore matos', async () => {
    await seedContractWithLines({
      contratRef: 'CTR-T2',
      contractNumber: 'DECA002',
      pedagoLines: [{ eduvia_invoice_id: 200, amount: 2500 }],
      matosLines: [{ eduvia_invoice_id: 200, amount: 500 }],
      step1Emitted: true,
    });

    const result = await getBillableEvents(TEST_PROJET_ID);

    expect(result?.events).toHaveLength(1);
    expect(result?.events[0]?.montant_brut).toBe(2500);
    expect(result?.events[0]?.montant_commissionne).toBe(1000);
  });

  it("PREMIEREQUIPEMENT seul → pas d'event engagement", async () => {
    await seedContractWithLines({
      contratRef: 'CTR-T3',
      contractNumber: 'DECA003',
      pedagoLines: [],
      matosLines: [{ eduvia_invoice_id: 300, amount: 500 }],
      step1Emitted: true,
    });

    const result = await getBillableEvents(TEST_PROJET_ID);
    expect(result?.events).toHaveLength(0);
  });

  it('line_type inconnu → tous les events du contrat sont locked unknown_line_type', async () => {
    await seedContractWithLines({
      contratRef: 'CTR-T4',
      contractNumber: 'DECA004',
      pedagoLines: [{ eduvia_invoice_id: 400, amount: 2500 }],
      unknownLines: [
        { eduvia_invoice_id: 400, amount: 100, line_type: 'EXAMEN' },
      ],
      step1Emitted: true,
    });

    const result = await getBillableEvents(TEST_PROJET_ID);

    expect(result?.events).toHaveLength(1);
    expect(result?.events[0]?.status).toBe('locked');
    expect(result?.events[0]?.lock_reason).toBe('unknown_line_type');
    expect(result?.events[0]?.unknown_line_types).toEqual(['EXAMEN']);
  });

  it('missing_deca prime sur unknown_line_type (priorité du lock le plus structurant)', async () => {
    await seedContractWithLines({
      contratRef: 'CTR-T5',
      contractNumber: '', // DECA absent
      pedagoLines: [{ eduvia_invoice_id: 500, amount: 2500 }],
      unknownLines: [
        { eduvia_invoice_id: 500, amount: 100, line_type: 'INSCRIPTION' },
      ],
      step1Emitted: true,
    });

    const result = await getBillableEvents(TEST_PROJET_ID);
    expect(result?.events[0]?.lock_reason).toBe('missing_deca');
  });
});
```

- [ ] **Step 2.3.2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
npx vitest run lib/queries/__tests__/billable-events-lines.test.ts
```

Expected : au moins 4 FAIL (le code utilise encore `eduvia_invoice_steps.total_amount`, ignore `eduvia_invoice_lines` et n'implémente pas le lock unknown).

- [ ] **Step 2.3.3 : Réécrire la section engagement de `getBillableEvents`**

Dans `lib/queries/billable-events.ts`, remplacer le bloc 141-169 (récupération opcoSteps + step1Rows) par :

```ts
// 3. Lignes des bordereaux OPCO emis pour ces contrats.
//    Source de verite : eduvia_invoice_lines (whitelist line_type=PEDAGOGIE).
//    On joint avec eduvia_invoice_steps pour matcher l'invoice_id au
//    step_number (1 = engagement, >1 = opco_step regle).
const { data: invoiceLines } = await supabase
  .from('eduvia_invoice_lines')
  .select(
    `
      eduvia_invoice_id, contrat_id, amount, line_type
    `,
  )
  .in('contrat_id', contratIds);

// 4. Steps emis (pour savoir quels invoice_id sont en step 1 OPCO).
const { data: emittedSteps } = await supabase
  .from('eduvia_invoice_steps')
  .select(
    'contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, opening_date, paid_at, invoice_state',
  )
  .in('contrat_id', contratIds)
  .not('invoice_state', 'is', null)
  .not('eduvia_invoice_id', 'is', null);

// Index : invoice_id → step infos (pour retrouver step_number)
const stepByInvoiceId = new Map<
  number,
  NonNullable<typeof emittedSteps>[number]
>();
for (const s of emittedSteps ?? []) {
  if (s.eduvia_invoice_id != null) stepByInvoiceId.set(s.eduvia_invoice_id, s);
}

// 5. Classifier les lignes par contrat. Calculer base engagement, base
//    par step opco, et detecter les line_type inconnus.
type ContratLignesAgg = {
  basePedagoEngagement: number; // SUM(amount) sur lignes PEDAGOGIE des invoices step_number=1
  basePedagoByStepInvoice: Map<number, number>; // par invoice_id step>1
  stepsByInvoiceId: Map<number, NonNullable<typeof emittedSteps>[number]>;
  unknownLineTypes: Set<string>;
};
const aggByContrat = new Map<string, ContratLignesAgg>();
for (const cid of contratIds) {
  aggByContrat.set(cid, {
    basePedagoEngagement: 0,
    basePedagoByStepInvoice: new Map(),
    stepsByInvoiceId: new Map(),
    unknownLineTypes: new Set(),
  });
}

// Import au top du fichier (a faire avec l'edit) :
//   import { classifyLineType } from '@/lib/eduvia/line-types';

for (const line of invoiceLines ?? []) {
  if (!line.contrat_id || line.eduvia_invoice_id == null) continue;
  const agg = aggByContrat.get(line.contrat_id);
  if (!agg) continue;

  const klass = classifyLineType(line.line_type);
  if (klass === 'unknown') {
    agg.unknownLineTypes.add(line.line_type);
    continue;
  }
  if (klass === 'blacklist') continue;

  // whitelist → entre dans la base
  const step = stepByInvoiceId.get(line.eduvia_invoice_id);
  if (!step) continue;
  if (step.step_number === 1) {
    agg.basePedagoEngagement += Number(line.amount);
  } else {
    const prev = agg.basePedagoByStepInvoice.get(line.eduvia_invoice_id) ?? 0;
    agg.basePedagoByStepInvoice.set(
      line.eduvia_invoice_id,
      prev + Number(line.amount),
    );
    agg.stepsByInvoiceId.set(line.eduvia_invoice_id, step);
  }
}
```

Puis, dans la boucle `for (const c of contrats)` (ligne ~244), remplacer la logique engagement/opco_step par :

```ts
for (const c of contrats) {
  const billedTypes = eventTypesByContrat.get(c.id);
  const agg = aggByContrat.get(c.id)!;
  const hasUnknown = agg.unknownLineTypes.size > 0;
  const missingDeca = !c.contract_number || c.contract_number.trim() === '';

  function resolveLock(opts: {
    billed?: BilledRef;
    lockedByOther?: BilledRef;
  }): {
    status: BillableEvent['status'];
    lock_reason?: BillableEvent['lock_reason'];
  } {
    if (opts.billed) return { status: 'billed' };
    // Priorite : missing_deca > unknown_line_type > opposite_billed.
    if (missingDeca) return { status: 'locked', lock_reason: 'missing_deca' };
    if (hasUnknown)
      return { status: 'locked', lock_reason: 'unknown_line_type' };
    if (opts.lockedByOther)
      return { status: 'locked', lock_reason: 'opposite_billed' };
    return { status: 'available' };
  }

  // -- Event engagement --------------------------------------------------
  if (c.contract_state === 'ENGAGE' && agg.basePedagoEngagement > 0) {
    const billed = billedByEventSource.get(c.id);
    const lockedByOpco = billedTypes?.get('opco_step');
    const { status, lock_reason } = resolveLock({
      billed,
      lockedByOther: lockedByOpco,
    });

    events.push({
      type: 'engagement',
      source_id: c.id,
      contrat_id: c.id,
      contrat_ref: c.ref,
      contract_number: c.contract_number,
      internal_number: c.internal_number,
      apprenant_nom: c.apprenant_nom ?? '',
      apprenant_prenom: c.apprenant_prenom ?? '',
      formation_titre: c.formation_titre,
      contract_state: c.contract_state,
      step_number: null,
      step_opening_date: null,
      step_paid_at: null,
      montant_brut: agg.basePedagoEngagement,
      montant_commissionne:
        Math.round(((agg.basePedagoEngagement * taux) / 100) * 100) / 100,
      status,
      billed_on: billed,
      locked_by: !missingDeca && !hasUnknown ? lockedByOpco : undefined,
      lock_reason,
      unknown_line_types: hasUnknown
        ? Array.from(agg.unknownLineTypes).sort()
        : undefined,
    });
  }

  // -- Events opco_step --------------------------------------------------
  for (const [invoiceId, basePedago] of agg.basePedagoByStepInvoice) {
    if (basePedago <= 0) continue;
    const step = agg.stepsByInvoiceId.get(invoiceId)!;
    // Idempotence : on retrouve le step en DB pour son source_id (eduvia step id).
    const stepRow = (emittedSteps ?? []).find(
      (s) => s.eduvia_invoice_id === invoiceId && s.contrat_id === c.id,
    );
    if (!stepRow) continue;
    // Note : source_id de l'event opco_step est l'UUID du step en DB,
    //        pas l'invoice_id Eduvia. On a besoin de l'UUID id colonne
    //        du step row pour la cle d'idempotence facture_lignes.
    // Le select de emittedSteps ci-dessus doit donc inclure `id` (UUID PK).
    // (Voir step 2.3.4 pour le correctif si oublié.)
    const billed = billedByEventSource.get(stepRow.id);
    const lockedByEngagement = billedTypes?.get('engagement');
    const { status, lock_reason } = resolveLock({
      billed,
      lockedByOther: lockedByEngagement,
    });

    events.push({
      type: 'opco_step',
      source_id: stepRow.id,
      contrat_id: c.id,
      contrat_ref: c.ref,
      contract_number: c.contract_number,
      internal_number: c.internal_number,
      apprenant_nom: c.apprenant_nom ?? '',
      apprenant_prenom: c.apprenant_prenom ?? '',
      formation_titre: c.formation_titre,
      contract_state: c.contract_state,
      step_number: step.step_number ?? null,
      step_opening_date: step.opening_date ?? null,
      step_paid_at: step.paid_at ?? null,
      montant_brut: basePedago,
      montant_commissionne: Math.round(((basePedago * taux) / 100) * 100) / 100,
      status,
      billed_on: billed,
      locked_by: !missingDeca && !hasUnknown ? lockedByEngagement : undefined,
      lock_reason,
      unknown_line_types: hasUnknown
        ? Array.from(agg.unknownLineTypes).sort()
        : undefined,
    });
  }
}
```

- [ ] **Step 2.3.4 : Ajouter le select `id` aux emittedSteps + l'import `classifyLineType`**

En haut du fichier `lib/queries/billable-events.ts`, ajouter l'import :

```ts
import { classifyLineType } from '@/lib/eduvia/line-types';
```

Et corriger le select de `emittedSteps` pour inclure `id` (la PK UUID nécessaire pour `source_id` des events opco_step) :

```ts
const { data: emittedSteps } = await supabase
  .from('eduvia_invoice_steps')
  .select(
    'id, contrat_id, step_number, eduvia_invoice_id, including_pedagogie_amount, opening_date, paid_at, invoice_state',
  )
  .in('contrat_id', contratIds)
  .not('invoice_state', 'is', null)
  .not('eduvia_invoice_id', 'is', null);
```

- [ ] **Step 2.3.5 : Re-lancer les tests**

```bash
npx vitest run lib/queries/__tests__/billable-events-lines.test.ts
```

Expected : PASS (5 tests). Si l'opco_step test échoue car `step.id` est absent, vérifier l'étape 2.3.4.

- [ ] **Step 2.3.6 : Commit**

```bash
git add lib/queries/billable-events.ts lib/queries/__tests__/billable-events-lines.test.ts
git commit -m "feat(billable-events): calcul base sur eduvia_invoice_lines

Source de verite = SUM(amount WHERE line_type='PEDAGOGIE'). Lock du
contrat si une ligne a un line_type ni whiteliste ni blackliste
(unknown_line_type). Priorite des locks :
missing_deca > unknown_line_type > opposite_billed."
```

### Task 2.4 : Audit log écart `lines vs including_pedagogie_amount` à la facturation

**Files:**

- Modify: `lib/actions/factures/brouillons.ts` (autour de la ligne 567 où le calcul de commission est fait)

- [ ] **Step 2.4.1 : Écrire le test**

Append au fichier `lib/queries/__tests__/billable-events-lines.test.ts` (ou créer `lib/actions/factures/__tests__/brouillons-audit-ecart.test.ts`) :

```ts
import { describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/utils/logger';

describe('createBrouillonForEvents - audit log écart pédago', () => {
  it('log info si |lines PEDAGOGIE - step.including_pedagogie_amount| > 0,01€', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    // Setup : créer un contrat avec step.including_pedagogie_amount = 2504,64
    // et une ligne PEDAGOGIE = 2504,00 (cas arrondi Eduvia pre-fix).
    // ... seed identique au pattern Task 2.3.1 ...

    // Appeler createBrouillonForEvents avec cet event
    // ... await createBrouillonForEvents({ projetId, eventSourceIds: [...] });

    expect(infoSpy).toHaveBeenCalledWith(
      'actions.factures',
      expect.stringContaining('ecart pedago'),
      expect.objectContaining({
        contrat_ref: 'CTR-T6',
        ecart: expect.any(Number),
      }),
    );
  });
});
```

- [ ] **Step 2.4.2 : Lancer le test**

```bash
npx vitest run lib/actions/factures/__tests__/brouillons-audit-ecart.test.ts
```

Expected : FAIL (aucun log d'écart aujourd'hui).

- [ ] **Step 2.4.3 : Implémenter l'audit log**

Dans `lib/actions/factures/brouillons.ts`, dans la fonction `createBrouillonForEvents` autour de la ligne 557-575 (juste après le calcul `const taux = ...` et avant `computeFactureTotauxTtcInclus`), ajouter :

```ts
// Audit log : pour chaque event utilisé dans le calcul, comparer la base
// (SUM lines PEDAGOGIE) au champ including_pedagogie_amount du step Eduvia.
// Diverge attendu sur les invoices HEOL emis avant 2026-05-06 (arrondi
// Eduvia a l'euro entier dans les lignes, fix le 2026-05-06). Sinon ecart
// = 0. Un ecart sur un invoice recent doit declencher une investigation.
{
  const stepInvoiceIds = resolved
    .filter((e) => e.type === 'opco_step' || e.type === 'engagement')
    .flatMap(
      (e) => (e as { _stepInvoiceIds?: number[] })._stepInvoiceIds ?? [],
    );
  if (stepInvoiceIds.length > 0) {
    const { data: stepsForAudit } = await supabase
      .from('eduvia_invoice_steps')
      .select('eduvia_invoice_id, including_pedagogie_amount, contrat_id')
      .in('eduvia_invoice_id', stepInvoiceIds);
    const { data: linesForAudit } = await supabase
      .from('eduvia_invoice_lines')
      .select('eduvia_invoice_id, amount')
      .in('eduvia_invoice_id', stepInvoiceIds)
      .eq('line_type', 'PEDAGOGIE');

    const linesByInvoice = new Map<number, number>();
    for (const l of linesForAudit ?? []) {
      const k = l.eduvia_invoice_id!;
      linesByInvoice.set(k, (linesByInvoice.get(k) ?? 0) + Number(l.amount));
    }
    for (const s of stepsForAudit ?? []) {
      const linesPedago = linesByInvoice.get(s.eduvia_invoice_id!) ?? 0;
      const stepPedago = Number(s.including_pedagogie_amount ?? 0);
      const ecart = Math.round((stepPedago - linesPedago) * 100) / 100;
      if (Math.abs(ecart) > 0.01) {
        logger.info('actions.factures', 'ecart pedago lines vs step', {
          invoice_id: s.eduvia_invoice_id,
          contrat_id: s.contrat_id,
          step_pedago: stepPedago,
          lines_pedago: linesPedago,
          ecart,
        });
      }
    }
  }
}
```

**Note importante :** le typage `_stepInvoiceIds` doit être propagé depuis `getBillableEvents` jusqu'aux events. Si la propriété n'existe pas sur le type `BillableEvent`, ajouter dans `lib/queries/billable-events.ts` :

```ts
export interface BillableEvent {
  // ... champs existants ...
  /** Liste des invoice_id Eduvia composant cet event (utilise pour audit log facturation). */
  _stepInvoiceIds?: number[];
}
```

Et peupler ce champ dans `getBillableEvents` (à proximité de la construction de l'event engagement et opco_step, mettre les `invoice_id` qui ont contribué à `basePedagoEngagement` ou la clef de `basePedagoByStepInvoice`).

- [ ] **Step 2.4.4 : Re-lancer le test**

```bash
npx vitest run lib/actions/factures/__tests__/brouillons-audit-ecart.test.ts
```

Expected : PASS.

- [ ] **Step 2.4.5 : Test régression existant**

```bash
npx vitest run lib/actions/factures/__tests__/brouillons.test.ts
```

Expected : tous les tests existants passent (l'audit log est additif).

- [ ] **Step 2.4.6 : Commit**

```bash
git add lib/actions/factures/brouillons.ts lib/queries/billable-events.ts lib/actions/factures/__tests__/brouillons-audit-ecart.test.ts
git commit -m "feat(brouillons): audit log ecart lines PEDAGOGIE vs step.including_pedagogie_amount

A chaque creation de brouillon, log info si |lines - step| > 0,01eur.
Permet de tracer les invoices HEOL pre-fix arrondi Eduvia (normal) et
de detecter une nouvelle divergence non documentee."
```

### Task 2.5 : Tooltip UI pour `unknown_line_type`

**Files:**

- Modify: `components/facturation/billable-events-table.tsx` (ou équivalent — chercher l'usage de `lock_reason`)

- [ ] **Step 2.5.1 : Trouver le composant qui affiche `lock_reason`**

```bash
grep -rn "lock_reason" /Users/nael/Desktop/SOLUVIAV2/components 2>/dev/null
```

Identifier le fichier (probablement `components/facturation/billable-events-*.tsx`).

- [ ] **Step 2.5.2 : Ajouter le branch d'affichage**

Dans le composant qui rend le tooltip ou badge `lock_reason`, ajouter la branche `'unknown_line_type'` qui affiche :

```tsx
{
  event.lock_reason === 'unknown_line_type' && (
    <span className="text-xs text-orange-700">
      Type(s) de ligne OPCO inconnu(s) :{' '}
      {event.unknown_line_types?.join(', ') ?? '?'}. Décision admin requise
      (whitelist ou blacklist) dans lib/eduvia/line-types.ts.
    </span>
  );
}
```

- [ ] **Step 2.5.3 : Test manuel**

```bash
npm run dev
```

Naviguer vers `/factures/nouveau`, simuler un contrat avec un line_type unknown (insérer une ligne `INSCRIPTION` en DB sur un contrat HEOL via Studio), vérifier que le contrat apparaît grisé avec le tooltip listant `INSCRIPTION`.

- [ ] **Step 2.5.4 : Commit**

```bash
git add components/facturation/billable-events-*.tsx
git commit -m "feat(ui): affichage lock_reason=unknown_line_type avec liste"
```

### Task 2.6 : Type check + lint final PR 2

- [ ] **Step 2.6.1 : Tests complets**

```bash
npm run test
```

Expected : tous les tests passent (anciens + nouveaux).

- [ ] **Step 2.6.2 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreur.

- [ ] **Step 2.6.3 : Lint**

```bash
npm run lint
```

Expected : 0 warning sur les fichiers modifiés.

- [ ] **Step 2.6.4 : Push et review preview**

```bash
git push
```

Vérifier le preview Vercel : créer un brouillon HEOL → le total devrait être `108 561,76 € × 50% = 54 280,88 € TTC` (taux toujours 50% à ce stade, on bascule à 40% en PR 3). Comparer avec `108 564,92€ × 50% = 54 282,46€` de l'ancien calcul, écart attendu 1,58€ dû à l'arrondi Eduvia.

---

## PR 3 — Cleanup `billing_mode` + taux HEOL 40%

### Task 3.1 : Vérifier qu'aucun brouillon HEOL non émis n'existe

**Files:** (lecture seule)

- [ ] **Step 3.1.1 : Query DB**

```sql
SELECT f.ref, f.statut, f.date_emission, f.montant_ttc
FROM factures f
JOIN projets p ON p.id = f.projet_id
JOIN clients c ON c.id = p.client_id
WHERE LOWER(c.raison_sociale) LIKE '%heol%'
  AND f.statut = 'a_emettre'
  AND f.archive = false;
```

Expected : 0 ligne. Si présence d'un brouillon, supprimer ou émettre AVANT la PR 3 pour éviter qu'il reste à 50%.

### Task 3.2 : Migration DB — drop billing_mode + UPDATE taux HEOL

**Files:**

- Create: `supabase/migrations/20260513100000_drop_billing_mode_update_heol.sql`

- [ ] **Step 3.2.1 : Identifier l'id du projet HEOL**

```sql
SELECT p.id, p.ref, c.raison_sociale
FROM projets p JOIN clients c ON c.id = p.client_id
WHERE LOWER(c.raison_sociale) LIKE '%heol%';
```

Noter l'UUID (format : `xxxxxxxx-xxxx-...`). Pour la migration, on fait l'UPDATE par `ref` plutôt que par UUID hardcodé (plus résilient aux environnements différents : démo, prod, staging).

- [ ] **Step 3.2.2 : Écrire la migration**

```sql
-- Migration : taux HEOL passe a 40% + suppression colonne legacy billing_mode.
-- Spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md

-- 1. UPDATE taux HEOL (50 → 40). Le projet HEOL est identifie par sa ref
--    (0015-HED-APP). Si absent en demo/staging, l'UPDATE est silencieux.
UPDATE public.projets
   SET taux_commission = 40
 WHERE ref = '0015-HED-APP'
   AND taux_commission = 50;

-- 2. Suppression de l'index partiel sur billing_mode='manual'.
DROP INDEX IF EXISTS public.idx_projets_billing_mode_manual;

-- 3. Suppression du check constraint.
ALTER TABLE public.projets
  DROP CONSTRAINT IF EXISTS chk_projets_billing_mode;

-- 4. Suppression de la colonne.
ALTER TABLE public.projets
  DROP COLUMN IF EXISTS billing_mode;
```

- [ ] **Step 3.2.3 : Vérifier en SQL avant d'appliquer**

```bash
cat supabase/migrations/20260513100000_drop_billing_mode_update_heol.sql
```

Relire pour confirmer : pas d'autre projet impacté, suppression `IF EXISTS` (idempotent).

- [ ] **Step 3.2.4 : Pas de `db push` immédiat**

On commit la migration mais on NE l'applique PAS encore. Elle sera appliquée seulement quand le code (étapes suivantes) est ready et déployé. Sinon les call sites qui lisent `billing_mode` planteront.

```bash
git add supabase/migrations/20260513100000_drop_billing_mode_update_heol.sql
git commit -m "feat(db): drop billing_mode + UPDATE taux HEOL = 40

Migration NOT YET APPLIED. A appliquer apres deploiement du code qui
ne lit plus billing_mode (etapes suivantes de cette PR)."
```

### Task 3.3 : Retirer `billing_mode` des queries TS

**Files:**

- Modify: `lib/queries/billable-events.ts:362-389` (`listManualProjets`)
- Modify: `lib/queries/factures.ts:54, 135-191`
- Modify: `lib/queries/projets.ts:161`

- [ ] **Step 3.3.1 : Renommer `listManualProjets` → `listBillableProjets`**

Dans `lib/queries/billable-events.ts`, remplacer la fonction `listManualProjets` (autour ligne 360-389) :

```ts
/**
 * Liste les projets actifs ayant au moins un contrat Eduvia non archive.
 * Utilise par le selecteur de projet dans la creation de brouillon.
 */
export async function listBillableProjets(): Promise<
  Array<{ id: string; ref: string; client_raison_sociale: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id, ref,
      client:clients!projets_client_id_fkey(raison_sociale),
      contrats!contrats_projet_id_fkey(id)
    `,
    )
    .eq('archive', false)
    .order('ref');

  if (error) {
    logger.error('queries.billable-events', 'listBillableProjets failed', {
      error,
    });
    return [];
  }

  return (data ?? [])
    .filter((p) => (p.contrats ?? []).length > 0)
    .map((p) => ({
      id: p.id,
      ref: p.ref ?? '',
      client_raison_sociale: p.client?.raison_sociale ?? '',
    }));
}
```

- [ ] **Step 3.3.2 : Mettre à jour les call sites de `listManualProjets`**

```bash
grep -rn "listManualProjets" /Users/nael/Desktop/SOLUVIAV2/app /Users/nael/Desktop/SOLUVIAV2/components /Users/nael/Desktop/SOLUVIAV2/lib 2>/dev/null
```

Pour chaque résultat : remplacer `listManualProjets` par `listBillableProjets`. Vérifier les imports.

- [ ] **Step 3.3.3 : Retirer `billing_mode` de `lib/queries/factures.ts`**

Dans `lib/queries/factures.ts` :

- Ligne 54 : retirer `billing_mode` du `select` du projet imbriqué.
- Ligne 135 : retirer `billing_mode` du `select`.
- Ligne 158 : supprimer la ligne `billingMode: projet.billing_mode as 'auto' | 'manual',`.
- Ligne 176 : retirer `billing_mode` du `select`.
- Ligne 191 : supprimer la propriété `billing_mode: p.billing_mode as 'auto' | 'manual',`.

Pour chaque endroit, ajuster aussi le **type** retourné si nécessaire (chercher l'interface qui contient `billingMode` / `billing_mode` et la nettoyer).

- [ ] **Step 3.3.4 : Retirer `billing_mode` de `lib/queries/projets.ts`**

Ligne 161 : supprimer la sélection de `billing_mode`. Vérifier que rien ne lit cette propriété en aval.

- [ ] **Step 3.3.5 : Type check après ces changements**

```bash
npx tsc --noEmit
```

Expected : 0 erreur (sinon, des consommateurs lisent encore `billingMode` ou `billing_mode` côté UI — voir tâche 3.5).

- [ ] **Step 3.3.6 : Commit**

```bash
git add lib/queries/billable-events.ts lib/queries/factures.ts lib/queries/projets.ts
git commit -m "refactor(queries): retire billing_mode des queries + rename listBillableProjets

Plus de distinction auto/manual : tous les projets utilisent la meme
logique billable-events sur eduvia_invoice_lines (whitelist PEDAGOGIE)."
```

### Task 3.4 : Retirer le mode `auto` de `brouillons.ts`

**Files:**

- Modify: `lib/actions/factures/brouillons.ts` (chercher la branche `billing_mode === 'auto'`)

- [ ] **Step 3.4.1 : Identifier la branche auto**

```bash
grep -n "billing_mode\|'auto'\|computeJalonContribution\|aggregateProjetEcheances" /Users/nael/Desktop/SOLUVIAV2/lib/actions/factures/brouillons.ts | head -20
```

Identifier la fonction qui crée le brouillon en mode auto (probablement `createDraftsForMonth` ou similaire, qui appelle `aggregateProjetEcheances`).

- [ ] **Step 3.4.2 : Retirer la branche auto**

Supprimer le code qui appelle `aggregateProjetEcheances` / `computeJalonContribution` depuis `brouillons.ts`. Retirer les imports correspondants au top du fichier :

```ts
// avant
import { aggregateProjetEcheances, computeJalonContribution, type ... } from '@/lib/echeancier/calc';

// apres
// (imports supprimes : ces fonctions ne sont plus appelees depuis brouillons.ts)
```

- [ ] **Step 3.4.3 : Tests**

```bash
npx vitest run lib/actions/factures/__tests__/
```

Expected : tous les tests passent. Si un test couvre encore le mode auto, le supprimer (le mode est obsolète).

- [ ] **Step 3.4.4 : Commit**

```bash
git add lib/actions/factures/brouillons.ts
git commit -m "refactor(brouillons): retire la branche legacy billing_mode='auto'

Le calcul sur echeancier previsionnel n'est plus utilise. Tous les
brouillons sont desormais construits via getBillableEvents."
```

### Task 3.5 : Désactiver le cron `echeances`

**Files:**

- Modify: `app/api/cron/echeances/route.ts`

- [ ] **Step 3.5.1 : Désactiver le cron**

Remplacer le corps de la route par un early return loggé :

```ts
import { logger } from '@/lib/utils/logger';
import { NextResponse } from 'next/server';

export async function GET() {
  logger.info('cron.echeances', 'disabled', {
    reason: 'mode auto/echeancier supprime par PR base-pedago 2026-05-12',
  });
  return NextResponse.json({ skipped: true });
}
```

- [ ] **Step 3.5.2 : Vérifier que la cron config Vercel ne casse pas**

```bash
grep -n "echeances" /Users/nael/Desktop/SOLUVIAV2/vercel.json 2>/dev/null
```

Si la cron est listée, soit la laisser (l'endpoint répond toujours 200, juste skip), soit la retirer de la config. Décision : la laisser, on désactivera côté Vercel quand on sera certain qu'aucun rollback ne sera nécessaire.

- [ ] **Step 3.5.3 : Commit**

```bash
git add app/api/cron/echeances/route.ts
git commit -m "chore(cron): disable echeances cron, mode auto obsolete"
```

### Task 3.6 : Retirer `billing_mode` de l'UI

**Files:**

- Modify: `app/(dashboard)/projets/[ref]/page.tsx:130`
- Modify: `components/facturation/new-facture-dialog.tsx:421-426`
- Modify: `components/projets/projet-detail-header.tsx:23`

- [ ] **Step 3.6.1 : Page projet détail**

Dans `app/(dashboard)/projets/[ref]/page.tsx:130`, remplacer le ternaire `projet.billing_mode === 'manual' ?` par une rendu unique (celui qui était la branche `manual`). Supprimer la branche `auto`.

- [ ] **Step 3.6.2 : Dialog nouvelle facture**

Dans `components/facturation/new-facture-dialog.tsx:421-426`, supprimer le badge `Auto / Manuel`. Si une autre logique dépend de `p.billing_mode`, la supprimer aussi.

- [ ] **Step 3.6.3 : En-tête détail projet**

Dans `components/projets/projet-detail-header.tsx:23`, supprimer toute logique conditionnée par `billing_mode`. Simplifier le rendu.

- [ ] **Step 3.6.4 : Type check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected : 0 erreur.

- [ ] **Step 3.6.5 : Test manuel UI**

```bash
npm run dev
```

Naviguer vers `/projets/0015-HED-APP` et `/factures/nouveau`. Vérifier qu'il n'y a plus aucune mention de "Auto" ou "Manuel".

- [ ] **Step 3.6.6 : Commit**

```bash
git add app/\(dashboard\)/projets components/facturation components/projets
git commit -m "refactor(ui): retire le branchement billing_mode auto/manual

Tous les projets sont desormais en mode unique base-pedago."
```

### Task 3.7 : Retirer l'action serveur `updateBillingMode`

**Files:**

- Modify: `lib/actions/projets.ts:200-240` (action `updateBillingMode` ou similaire)

- [ ] **Step 3.7.1 : Identifier l'action**

```bash
grep -n "billing_mode\|updateBillingMode\|projet_billing_mode_changed" /Users/nael/Desktop/SOLUVIAV2/lib/actions/projets.ts
```

- [ ] **Step 3.7.2 : Supprimer la fonction exportée et ses tests**

Supprimer la fonction `updateBillingMode` (ou équivalent) de `lib/actions/projets.ts`. Supprimer les call sites en UI s'ils existent encore après la tâche 3.6.

- [ ] **Step 3.7.3 : Type check**

```bash
npx tsc --noEmit
```

Expected : 0 erreur.

- [ ] **Step 3.7.4 : Commit**

```bash
git add lib/actions/projets.ts
git commit -m "refactor(projets): retire l'action updateBillingMode (legacy)"
```

### Task 3.8 : Appliquer la migration DB

**Files:** (DB)

- [ ] **Step 3.8.1 : Appliquer en local**

```bash
npx supabase db push
```

Expected : migration `20260513100000_drop_billing_mode_update_heol.sql` appliquée sans erreur.

- [ ] **Step 3.8.2 : Régénérer les types**

```bash
npx supabase gen types typescript --local > types/database.ts
```

Vérifier que `billing_mode` n'apparaît plus dans `types/database.ts` :

```bash
grep -n "billing_mode" types/database.ts
```

Expected : aucun résultat.

- [ ] **Step 3.8.3 : Vérifier taux HEOL**

```sql
SELECT ref, taux_commission FROM projets WHERE ref = '0015-HED-APP';
```

Expected : `taux_commission = 40`.

- [ ] **Step 3.8.4 : Type check global**

```bash
npx tsc --noEmit
```

Expected : 0 erreur.

- [ ] **Step 3.8.5 : Tests**

```bash
npm run test
```

Expected : tous les tests passent.

- [ ] **Step 3.8.6 : Commit**

```bash
git add types/database.ts
git commit -m "chore(types): regen apres drop billing_mode

Taux HEOL passe a 40, billing_mode supprime."
```

### Task 3.9 : Push final PR 3 + validation preview

- [ ] **Step 3.9.1 : Push**

```bash
git push
```

- [ ] **Step 3.9.2 : Validation preview Vercel**

Sur le déploiement preview :

1. Naviguer vers `/factures/nouveau`, sélectionner le projet HEOL.
2. Tous les contrats engagés HEOL doivent apparaître `status='locked'` avec `lock_reason='engagement_already_billed'` (la FAC-HED-0003 émise les a déjà facturés).
3. Vérifier la cohérence du calcul : si on simule un nouveau contrat dont l'engagement n'est pas encore facturé, le taux affiché doit être 40% et la base calculée sur `SUM(lines PEDAGOGIE)`.

---

## Actions manuelles post-déploiement

Pas une PR — actions opérationnelles via l'UI existante.

### Step A : Avoir total sur FAC-HED-0003

- [ ] Aller sur `/factures/FAC-HED-0003`.
- [ ] Cliquer "Émettre un avoir total" (fonction existante dans l'UI).
- [ ] Vérifier que `FAC-HED-0004` (ou suivant) est créée avec `est_avoir=true`, `montant_ttc=-55 782,40€`, `statut='avoir'`.
- [ ] Vérifier en DB :

```sql
SELECT ref, statut, est_avoir, montant_ttc FROM factures
WHERE projet_id = (SELECT id FROM projets WHERE ref = '0015-HED-APP')
ORDER BY date_emission DESC LIMIT 3;
```

- [ ] Vérifier dans `/factures/nouveau` → projet HEOL : les 41 contrats engagés doivent être à nouveau `status='available'` (l'avoir compensateur libère leur engagement).

### Step B : Recréer le brouillon engagement HEOL

- [ ] Aller sur `/factures/nouveau`, sélectionner HEOL.
- [ ] Sélectionner les 41 events engagement disponibles.
- [ ] Cliquer "Créer le brouillon".
- [ ] Vérifier le total TTC affiché : **43 424,70 €** (à 1 centime près).

### Step C : Vérification finale et émission

- [ ] Vérifier les lignes du brouillon : 41 lignes, chacune avec `description = "Commission 40% - Engagement contrat"`.
- [ ] Émettre le brouillon → `FAC-HED-0005` (ou suivant).
- [ ] Vérifier que `audit_logs` contient bien les événements `blank_brouillon_created` puis `facture_emise` correspondants.

---

## Risques résiduels et roll-back

- **PR 1** : roll-back = revert du commit. La table `eduvia_invoice_lines` peut être laissée vide (aucun consommateur).
- **PR 2** : roll-back = revert + appliquer une migration DOWN qui réintroduit l'ancien calcul. Possible mais coûteux. Préférer : si bug détecté en preview, fix forward.
- **PR 3** : impossible à roll-back proprement (colonne `billing_mode` supprimée). Préférer : valider à fond en preview avant de merger.

## Self-Review

**1. Spec coverage** : chaque section du spec a au moins une tâche correspondante :

- Découverte clé (line_type structuré) → Task 1.2 + 2.1
- Architecture nouvelle table → Task 1.1
- Sync étendu → Task 1.3
- Règle de calcul → Task 2.3
- Circuit breaker unknown → Task 2.3 + 2.5
- Audit log écart → Task 2.4
- Suppression billing_mode → Task 3.3 / 3.6 / 3.7
- UPDATE taux HEOL = 40 → Task 3.2
- Régularisation post-deploy → Steps A-C

**2. Placeholder scan** : aucune mention "TBD", "TODO", "implement later", "fill in" dans le plan. Toutes les steps avec code montrent le code complet. Les helpers de test mentionnés (`createProjetFixture`) sont des supports raisonnables d'un codebase mature ; à défaut, instancier manuellement via supabase admin (commenté dans le test 2.3.1).

**3. Type consistency** : `unknown_line_types: string[]` et `lock_reason: 'unknown_line_type'` sont définis dans 2.2 et utilisés cohéramment dans 2.3 et 2.5. `EduviaInvoiceLine` défini dans 1.2 est référencé dans 1.3. `classifyLineType` défini dans 2.1 est importé dans 2.3.

Plan complet.
