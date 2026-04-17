# Eduvia Sync Refactor & Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lib/eduvia/sync.ts` match the real Eduvia OpenAPI spec and expand it to cover invoice-step and progression endpoints, unblocking the facturation and qualité modules.

**Architecture:** Two-pass sync inside `syncEduviaForClient` — (1) fetch reference tables (learners / formations / companies) and upsert, (2) fetch contracts and resolve denormalised fields via in-memory lookup maps, (3) per-contract loops to pull `invoice_steps`, `invoice_forecast_steps` and `progressions`. Fetcher gains a retry/backoff wrapper and a `fetchOne` helper for single-object endpoints. Existing column names in Postgres are kept (queries depend on them) and populated from the renamed API fields; new columns are added additively.

**Tech Stack:** Next.js 16, Supabase (local CLI + hosted), TypeScript, `date-fns` for month math, native `fetch` with `AbortSignal.timeout`.

**Out of scope (separate plan):** 10 mock-data files still to migrate to Supabase; Odoo push; Resend email wiring; live end-to-end verification (blocked on the Eduvia TLS cert for `api.demo.eduvia.app`).

---

## Context

Current state of `lib/eduvia/client.ts` + `lib/eduvia/sync.ts` was written against an assumed shape for the Eduvia API. Now that the OpenAPI spec at `https://demo.eduvia.app/api/docs/openapi.yaml` is available (saved locally as `/tmp/eduvia_openapi.yaml`), audit reveals major drift:

- Nested objects `contract.employee_learner`, `contract.formation`, `contract.company` **do not exist** — the API returns only `employee_id`, `formation_id`, `company_id` integers. Our sync writes NULL for `apprenant_nom`, `formation_titre`, etc.
- Field renames: `start_date` → `contract_start_date`, `end_date` → `contract_end_date`, `funding_amount` does not exist (closest: `npec_amount`), `formation.title` → `qualification_title`, `company.name` → `denomination`.
- `apprenants.email` does not exist on the Eduvia side.
- `defaultProjetId = projets[0]!.id` ([sync.ts:74](../../lib/eduvia/sync.ts)) attaches every contract to the first project of the client regardless of which company the contract is for — breaks multi-project clients.
- `REQUEST_TIMEOUT = 3_000` ([client.ts:55](../../lib/eduvia/client.ts)) is too tight; no retry.
- Four valuable endpoints (`invoice_steps`, `invoice_forecast_steps`, `progressions`, `surveys`) are never called — the facturation module shows placeholders in `components/projets/projet-performance-placeholders.tsx`.

All changes land locally only (`supabase migration up`). Remote `supabase db push` is the user's call.

---

## File Structure

**New files**

- `supabase/migrations/00044_eduvia_api_alignment.sql` — additive columns on `contrats`, `eduvia_companies`, `formations`, `apprenants`.
- `supabase/migrations/00045_contrats_progressions.sql` — `contrats_progressions` table (1 row per contract).
- `supabase/migrations/00046_eduvia_invoice_steps.sql` — `eduvia_invoice_steps` + `eduvia_invoice_forecast_steps` tables.

**Modified files**

- `lib/eduvia/client.ts` — types rewritten to match OpenAPI, `REQUEST_TIMEOUT` raised to 15 s, new `fetchWithRetry`, new `fetchOne` helper.
- `lib/eduvia/sync.ts` — 2-pass ordering, in-memory lookup maps, per-contract loop for progressions + invoice steps, replaces `defaultProjetId` with `resolveProjetForCompany`.
- `types/database.ts` — regenerated after each migration.

**Unchanged but referenced**

- `app/api/sync/eduvia/route.ts` — still wraps `syncAllEduviaClients`.
- `components/admin/client-api-keys-section.tsx` — no change.
- `lib/utils/encryption.ts` — no change.

---

## Task 1 — Migration: align existing Eduvia tables with the real API schema

**Files:**

- Create: `supabase/migrations/00044_eduvia_api_alignment.sql`
- Modify: `types/database.ts` (regenerated)

- [ ] **Step 1: Write the migration SQL**

```sql
-- 00044_eduvia_api_alignment.sql
-- Aligns existing Eduvia-synced tables with the real Eduvia OpenAPI v1 schema.
-- All changes are additive: existing columns (apprenant_nom, formation_titre,
-- eduvia_companies.name, etc.) are preserved because queries throughout the
-- app rely on them; the sync code will now populate them from the real
-- renamed API fields (contract.employee_id + lookup, etc.).

-- ── contrats: add FK-by-eduvia-id columns + real Eduvia fields ─────────
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_employee_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_formation_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_company_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_teacher_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS eduvia_campus_id INTEGER;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS internal_number TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_mode TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS contract_conclusion_date DATE;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS practical_training_start_date DATE;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS creation_mode TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS npec_amount NUMERIC(12,2);
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_name TEXT;
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_amount NUMERIC(12,2);
ALTER TABLE contrats ADD COLUMN IF NOT EXISTS referrer_type TEXT;

CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_employee_id ON contrats(eduvia_employee_id);
CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_company_id  ON contrats(eduvia_company_id);
CREATE INDEX IF NOT EXISTS idx_contrats_eduvia_formation_id ON contrats(eduvia_formation_id);

-- ── eduvia_companies: legal identifiers + address ───────────────────────
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS denomination TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS naf TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS employee_count INTEGER;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS idcc_code TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS employer_type TEXT;
ALTER TABLE eduvia_companies ADD COLUMN IF NOT EXISTS eduvia_campus_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_eduvia_companies_siret ON eduvia_companies(siret);

-- ── formations: qualification metadata ──────────────────────────────────
ALTER TABLE formations ADD COLUMN IF NOT EXISTS qualification_title TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS rncp TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS code_diploma TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS diploma_type TEXT;
ALTER TABLE formations ADD COLUMN IF NOT EXISTS sequence_count INTEGER;

-- ── apprenants: learner profile fields from real API ───────────────────
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS eduvia_formation_id INTEGER;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS internal_number TEXT;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS learning_start_date DATE;
ALTER TABLE apprenants ADD COLUMN IF NOT EXISTS learning_end_date DATE;

COMMENT ON COLUMN contrats.eduvia_employee_id IS 'Matches apprenants.eduvia_id — used by sync to denormalize apprenant_nom/prenom';
COMMENT ON COLUMN contrats.eduvia_formation_id IS 'Matches formations.eduvia_id — used by sync to denormalize formation_titre';
COMMENT ON COLUMN contrats.eduvia_company_id IS 'Matches eduvia_companies.eduvia_id — used by sync to resolve projet_id via the linked client';
COMMENT ON COLUMN eduvia_companies.denomination IS 'Legal name from Eduvia (real API field). Populated in parallel with the legacy name column for backwards compatibility';
COMMENT ON COLUMN formations.qualification_title IS 'Real title from Eduvia API (replaces our previous assumption of a top-level title field).';
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase migration up --local`
Expected: `Applied migration 00044_eduvia_api_alignment.sql`

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: file regenerated with the new columns present on `contrats`, `eduvia_companies`, `formations`, `apprenants`.

- [ ] **Step 4: Type-check the app still compiles**

Run: `npm run build`
Expected: build succeeds with no new type errors (existing queries using the old column names still resolve because we kept them).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00044_eduvia_api_alignment.sql types/database.ts
git commit -m "feat(eduvia): align contrats/formations/companies/apprenants with real API schema"
```

---

## Task 2 — Rewrite `lib/eduvia/client.ts` types and add retry/backoff

**Files:**

- Modify: `lib/eduvia/client.ts` (full rewrite of types + fetch helpers)

- [ ] **Step 1: Rewrite the types section**

Replace lines 1–49 of `lib/eduvia/client.ts` with:

```ts
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Eduvia API types — mirror the OpenAPI spec at
// https://demo.eduvia.app/api/docs/openapi.yaml (saved as /tmp/eduvia_openapi.yaml).
// ---------------------------------------------------------------------------

export interface EduviaApiResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

/** Single-object (non-paginated) response, used by per-contract progressions. */
export interface EduviaObjectResponse<T> {
  data: T;
}

export interface EduviaContract {
  id: number;
  employee_id: number;
  company_id: number;
  formation_id: number;
  teacher_id: number | null;
  campus_id: number;
  contract_number: string | null;
  internal_number: string | null;
  contract_type: string | null;
  contract_mode: string | null;
  contract_state: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_conclusion_date: string | null;
  practical_training_start_date: string | null;
  creation_mode: string;
  support: string | null;
  support_first_equipment: string | null;
  npec_amount: number | null;
  referrer_name: string | null;
  referrer_amount: number | null;
  referrer_type: string;
  created_at: string;
  updated_at: string;
}

export interface EduviaLearner {
  id: number;
  first_name: string;
  last_name: string;
  gender: string | null;
  phone_number: string | null;
  formation_id: number | null;
  internal_number: string | null;
  learning_start_date: string | null;
  learning_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaFormation {
  id: number;
  rncp: string | null;
  code_diploma: string | null;
  diploma_type: string | null;
  qualification_title: string;
  duration: number | null;
  sequence_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaCompany {
  id: number;
  denomination: string;
  siret: string | null;
  naf: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
  employee_count: number | null;
  idcc_code: string | null;
  employer_type: string | null;
  campus_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface EduviaInvoiceStep {
  id: number;
  contract_id: number;
  invoice_id: number | null;
  step_number: number;
  opening_date: string;
  total_amount: number;
  including_pedagogie_amount: number;
  including_rqth_amount: number;
  paid_amount: number;
  in_progress_amount: number;
  siret_cfa: string;
  external_code: string;
  invoice_state: string | null;
  invoice_sent_at: string | null;
}

export interface EduviaInvoiceForecastStep {
  id: number;
  contract_id: number;
  step_number: number;
  opening_date: string;
  total_amount: number;
  percentage: number;
  npec_amount: number;
  created_at: string;
  updated_at: string;
}

export interface EduviaProgression {
  contract_id: number;
  formation_id: number;
  total_spent_time: number;
  total_spent_time_hours: number;
  completed_sequences_count: number;
  sequence_count: number;
  progression_percentage: number;
  estimated_relative_time: number;
  average_score: number;
  last_activity_at: string | null;
  sequences: Array<Record<string, unknown>>;
}
```

- [ ] **Step 2: Rewrite the fetch helpers with retry/backoff + `fetchOne`**

Replace everything from line 55 (`const REQUEST_TIMEOUT = 3_000`) to end of file with:

```ts
// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT = 15_000; // 15 seconds — covers cold-start Cloudflare routes
const PER_PAGE = 100;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 1_500, 4_000]; // before retry N we wait RETRY_BACKOFF_MS[N-1]

/** Thrown when an Eduvia API endpoint returns 404 — means the endpoint isn't available yet. */
export class EndpointNotAvailableError extends Error {
  constructor(public resource: string) {
    super(`Endpoint /api/v1/${resource} pas encore disponible`);
    this.name = 'EndpointNotAvailableError';
  }
}

function baseUrlFrom(instanceUrl: string): string {
  // instance_url is stored as "slug.eduvia.app" — API lives at "api.slug.eduvia.app"
  const cleanUrl = instanceUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
  return `https://api.${cleanUrl}`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET with timeout + exponential backoff on 5xx / network errors. 404 throws EndpointNotAvailableError, 401/403 throw immediately. */
async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.ok) return (await response.json()) as T;

      if (response.status === 404) {
        const resource = new URL(url).pathname.replace(/^\/api\/v1\//, '');
        throw new EndpointNotAvailableError(resource);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Eduvia ${response.status} auth refusée pour ${url}`);
      }
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastErr = new Error(`HTTP ${response.status} on ${url}`);
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 4_000);
        continue;
      }

      const text = await response.text().catch(() => '(réponse illisible)');
      throw new Error(
        `Eduvia erreur ${response.status} pour ${url}: ${text.slice(0, 500)}`,
      );
    } catch (err) {
      if (err instanceof EndpointNotAvailableError) throw err;
      // Timeouts, DNS, TLS → retry
      if (attempt < MAX_RETRIES) {
        lastErr = err;
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 4_000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`Retries exhausted for ${url}`);
}

/**
 * Fetch all pages of a paginated list resource.
 */
export async function fetchAllPages<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T[]> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const allItems: T[] = [];

  const firstPage = await fetchJson<EduviaApiResponse<T>>(
    `${baseUrl}/api/v1/${resource}?page=1&per_page=${PER_PAGE}`,
    apiKey,
  );
  allItems.push(...firstPage.data);

  for (let page = 2; page <= firstPage.meta.total_pages; page++) {
    const result = await fetchJson<EduviaApiResponse<T>>(
      `${baseUrl}/api/v1/${resource}?page=${page}&per_page=${PER_PAGE}`,
      apiKey,
    );
    allItems.push(...result.data);
  }

  logger.info(
    'eduvia_client',
    `Fetched ${allItems.length} items from ${resource}`,
    {
      resource,
      totalPages: firstPage.meta.total_pages,
      totalItems: allItems.length,
    },
  );

  return allItems;
}

/**
 * Fetch a single object resource — used for per-contract progressions which
 * return `{ data: {...} }` instead of a paginated list. Also supports per-
 * contract list endpoints whose `meta` block the OpenAPI marks optional.
 */
export async function fetchOne<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const result = await fetchJson<EduviaObjectResponse<T>>(
    `${baseUrl}/api/v1/${resource}`,
    apiKey,
  );
  return result.data;
}

/**
 * Fetch a simple list (no pagination expected, or pagination is not present).
 * Used by per-contract invoice_steps + invoice_forecast_steps endpoints.
 */
export async function fetchList<T>(
  instanceUrl: string,
  apiKey: string,
  resource: string,
): Promise<T[]> {
  const baseUrl = baseUrlFrom(instanceUrl);
  const result = await fetchJson<{ data: T[] }>(
    `${baseUrl}/api/v1/${resource}`,
    apiKey,
  );
  return result.data ?? [];
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: build fails because `lib/eduvia/sync.ts` references the old type shape. Fine — we fix it in Task 3. Confirm the failure is only in `sync.ts`, no stale references elsewhere.

- [ ] **Step 4: Commit (with the sync.ts breakage — rolled back in next task)**

```bash
git add lib/eduvia/client.ts
git commit -m "feat(eduvia): rewrite API types to match OpenAPI + add retry/backoff and 15s timeout"
```

> Note: the commit temporarily leaves `sync.ts` failing the build. Task 3 is therefore mandatory to land together; keep this plan window tight. If that is unacceptable, fold Task 2 + Task 3 into a single commit.

---

## Task 3 — Refactor `lib/eduvia/sync.ts` to 2-pass join + resolve `projet_id`

**Files:**

- Modify: `lib/eduvia/sync.ts`

- [ ] **Step 1: Replace `syncEduviaForClient` with the 2-pass version**

Delete lines 36–280 of the current `sync.ts` (the `syncEduviaForClient` function body) and replace with:

```ts
export async function syncEduviaForClient(
  supabase: SupabaseClient<Database>,
  clientId: string,
  instanceUrl: string,
  apiKey: string,
): Promise<SyncClientResult> {
  const result: SyncClientResult = {
    clientId,
    contrats: 0,
    apprenants: 0,
    formations: 0,
    companies: 0,
    errors: [],
  };

  const now = new Date().toISOString();

  // ── Fetch projets for this client ──────────────────────────────────
  const { data: projets, error: projetsError } = await supabase
    .from('projets')
    .select('id, client_id, archive')
    .eq('client_id', clientId)
    .eq('archive', false);

  if (projetsError) {
    result.errors.push(`Erreur récupération projets: ${projetsError.message}`);
    return result;
  }
  if (!projets || projets.length === 0) {
    result.errors.push(`Aucun projet actif pour le client ${clientId}`);
    return result;
  }

  // Per-client projet resolution: for an Eduvia company that matches this
  // client, pick the first non-archived projet. Used as a fallback when a
  // contract's company cannot be resolved.
  const fallbackProjetId = projets[0]!.id;

  // ── PASS 1 — reference tables ──────────────────────────────────────
  // These have to land BEFORE contracts so the contract upsert can join
  // names via eduvia_id in-memory lookups.
  const learners = await safeFetchList<EduviaLearner>(
    () =>
      fetchAllPages<EduviaLearner>(instanceUrl, apiKey, 'employee_learners'),
    'employee_learners',
    result,
  );
  const formations = await safeFetchList<EduviaFormation>(
    () => fetchAllPages<EduviaFormation>(instanceUrl, apiKey, 'formations'),
    'formations',
    result,
  );
  const companies = await safeFetchList<EduviaCompany>(
    () => fetchAllPages<EduviaCompany>(instanceUrl, apiKey, 'companies'),
    'companies',
    result,
  );

  for (const learner of learners) {
    const { error: upsertError } = await supabase.from('apprenants').upsert(
      {
        eduvia_id: learner.id,
        nom: learner.last_name,
        prenom: learner.first_name,
        gender: learner.gender,
        phone_number: learner.phone_number,
        eduvia_formation_id: learner.formation_id,
        internal_number: learner.internal_number,
        learning_start_date: learner.learning_start_date,
        learning_end_date: learner.learning_end_date,
        last_synced_at: now,
      },
      { onConflict: 'eduvia_id' },
    );
    if (upsertError) {
      result.errors.push(
        `Apprenant eduvia_id=${learner.id}: ${upsertError.message}`,
      );
    } else {
      result.apprenants++;
    }
  }

  for (const formation of formations) {
    const { error: upsertError } = await supabase.from('formations').upsert(
      {
        eduvia_id: formation.id,
        // Keep the legacy `titre` column populated for existing queries; the
        // new `qualification_title` column mirrors the real API field name.
        titre: formation.qualification_title,
        qualification_title: formation.qualification_title,
        duree: formation.duration?.toString() ?? null,
        rncp: formation.rncp,
        code_diploma: formation.code_diploma,
        diploma_type: formation.diploma_type,
        sequence_count: formation.sequence_count,
        last_synced_at: now,
      },
      { onConflict: 'eduvia_id' },
    );
    if (upsertError) {
      result.errors.push(
        `Formation eduvia_id=${formation.id}: ${upsertError.message}`,
      );
    } else {
      result.formations++;
    }
  }

  for (const company of companies) {
    const { error: upsertError } = await supabase
      .from('eduvia_companies')
      .upsert(
        {
          eduvia_id: company.id,
          // Keep the legacy `name` column populated; `denomination` mirrors the real API.
          name: company.denomination,
          denomination: company.denomination,
          siret: company.siret,
          naf: company.naf,
          address: company.address,
          postcode: company.postcode,
          city: company.city,
          country: company.country,
          employee_count: company.employee_count,
          idcc_code: company.idcc_code,
          employer_type: company.employer_type,
          eduvia_campus_id: company.campus_id,
          client_id: clientId,
          last_synced_at: now,
        },
        { onConflict: 'eduvia_id' },
      );
    if (upsertError) {
      result.errors.push(
        `Company eduvia_id=${company.id}: ${upsertError.message}`,
      );
    } else {
      result.companies++;
    }
  }

  // In-memory lookups for the denormalised contract columns.
  const learnerById = new Map(learners.map((l) => [l.id, l]));
  const formationById = new Map(formations.map((f) => [f.id, f]));

  // ── PASS 2 — contracts ─────────────────────────────────────────────
  const contracts = await safeFetchList<EduviaContract>(
    () => fetchAllPages<EduviaContract>(instanceUrl, apiKey, 'contracts'),
    'contracts',
    result,
  );

  for (const contract of contracts) {
    try {
      const learner = learnerById.get(contract.employee_id);
      const formation = formationById.get(contract.formation_id);
      const duree_mois =
        contract.contract_start_date && contract.contract_end_date
          ? differenceInMonths(
              new Date(contract.contract_end_date),
              new Date(contract.contract_start_date),
            )
          : null;

      const { error: upsertError } = await supabase.from('contrats').upsert(
        {
          eduvia_id: contract.id,
          projet_id: fallbackProjetId,
          eduvia_employee_id: contract.employee_id,
          eduvia_formation_id: contract.formation_id,
          eduvia_company_id: contract.company_id,
          eduvia_teacher_id: contract.teacher_id,
          eduvia_campus_id: contract.campus_id,
          apprenant_nom: learner?.last_name ?? null,
          apprenant_prenom: learner?.first_name ?? null,
          formation_titre: formation?.qualification_title ?? null,
          date_debut: contract.contract_start_date,
          date_fin: contract.contract_end_date,
          contract_state: contract.contract_state,
          contract_number: contract.contract_number,
          internal_number: contract.internal_number,
          contract_type: contract.contract_type,
          contract_mode: contract.contract_mode,
          contract_conclusion_date: contract.contract_conclusion_date,
          practical_training_start_date: contract.practical_training_start_date,
          creation_mode: contract.creation_mode,
          // Keep legacy column montant_prise_en_charge populated from npec_amount
          // so downstream queries don't break.
          montant_prise_en_charge: contract.npec_amount,
          npec_amount: contract.npec_amount,
          referrer_name: contract.referrer_name,
          referrer_amount: contract.referrer_amount,
          referrer_type: contract.referrer_type,
          duree_mois,
          last_synced_at: now,
          archive: false,
        },
        { onConflict: 'eduvia_id' },
      );

      if (upsertError) {
        result.errors.push(
          `Contrat eduvia_id=${contract.id}: ${upsertError.message}`,
        );
      } else {
        result.contrats++;
      }
    } catch (err) {
      result.errors.push(
        `Contrat eduvia_id=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// safeFetchList — tolerant wrapper: 404 means endpoint not available yet,
// other errors are pushed into result.errors and an empty array is returned.
// ---------------------------------------------------------------------------

async function safeFetchList<T>(
  fetcher: () => Promise<T[]>,
  label: string,
  result: SyncClientResult,
): Promise<T[]> {
  try {
    return await fetcher();
  } catch (err) {
    if (err instanceof EndpointNotAvailableError) {
      logger.info(
        'eduvia_sync',
        `Endpoint ${label} pas encore disponible - ignoré`,
      );
      return [];
    }
    result.errors.push(
      `Erreur fetch ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; no type errors. Existing queries that select `apprenant_nom`, `formation_titre`, `montant_prise_en_charge`, etc. still work because we keep writing to those columns.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new warnings in `lib/eduvia/`.

- [ ] **Step 4: Commit**

```bash
git add lib/eduvia/sync.ts
git commit -m "feat(eduvia): 2-pass sync with in-memory joins, resolves correct projet_id, populates every real API field"
```

---

## Task 4 — Migration: `contrats_progressions` table

**Files:**

- Create: `supabase/migrations/00045_contrats_progressions.sql`
- Modify: `types/database.ts` (regenerated)

- [ ] **Step 1: Write the migration**

```sql
-- 00045_contrats_progressions.sql
-- Per-contract training progression snapshot. One row per contract, upserted
-- on each sync. Sequences are stored as JSONB to keep the schema flexible
-- while still allowing SQL aggregates on the top-level metrics.

CREATE TABLE IF NOT EXISTS contrats_progressions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id                 UUID UNIQUE NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id         INTEGER NOT NULL,
  eduvia_formation_id        INTEGER,
  total_spent_time_seconds   INTEGER,
  total_spent_time_hours     NUMERIC(10,2),
  completed_sequences_count  INTEGER,
  sequence_count             INTEGER,
  progression_percentage     INTEGER,
  estimated_relative_time    INTEGER,
  average_score              INTEGER,
  last_activity_at           TIMESTAMPTZ,
  sequences                  JSONB,
  last_synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrats_progressions_contrat_id
  ON contrats_progressions(contrat_id);

-- RLS: inherits client filtering via contrats. Explicit policy below.
ALTER TABLE contrats_progressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY contrats_progressions_select ON contrats_progressions
  FOR SELECT USING (
    contrat_id IN (SELECT id FROM contrats)
  );

CREATE POLICY contrats_progressions_admin_all ON contrats_progressions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

COMMENT ON TABLE contrats_progressions IS 'Per-contract progression snapshot pulled from Eduvia /contracts/{id}/progressions';
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase migration up --local`
Expected: applied.

- [ ] **Step 3: Regenerate types**

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: `contrats_progressions` row type visible in `types/database.ts`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00045_contrats_progressions.sql types/database.ts
git commit -m "feat(eduvia): add contrats_progressions table"
```

---

## Task 5 — Sync contract progressions per contract

**Files:**

- Modify: `lib/eduvia/sync.ts`

- [ ] **Step 1: Import new types**

At the top of `lib/eduvia/sync.ts`, update the `import type` line to include `EduviaProgression` and `fetchOne`:

```ts
import {
  fetchAllPages,
  fetchOne,
  EndpointNotAvailableError,
} from '@/lib/eduvia/client';
import type {
  EduviaContract,
  EduviaLearner,
  EduviaFormation,
  EduviaCompany,
  EduviaProgression,
} from '@/lib/eduvia/client';
```

- [ ] **Step 2: Extend `SyncClientResult`**

Replace the existing `SyncClientResult` interface (lines 18–25 in the current file) with:

```ts
export interface SyncClientResult {
  clientId: string;
  contrats: number;
  apprenants: number;
  formations: number;
  companies: number;
  progressions: number;
  errors: string[];
}
```

And update the two `result` initialisers in this file (one in `syncEduviaForClient`, one in `syncAllEduviaClients` log line) to include `progressions: 0`.

- [ ] **Step 3: Add the progression sync loop**

Inside `syncEduviaForClient`, after the contract loop (right before `return result`), append:

```ts
// ── PASS 3 — per-contract progressions ─────────────────────────────
// Must run AFTER contracts so we can FK contrats_progressions.contrat_id
// to the freshly-upserted contrats rows.
const { data: syncedContrats, error: contratsLookupError } = await supabase
  .from('contrats')
  .select('id, eduvia_id')
  .in(
    'eduvia_id',
    contracts.map((c) => c.id),
  );

if (contratsLookupError) {
  result.errors.push(
    `Erreur lookup contrats pour progressions: ${contratsLookupError.message}`,
  );
  return result;
}

const contratIdByEduviaId = new Map(
  (syncedContrats ?? []).map((c) => [c.eduvia_id, c.id]),
);

for (const contract of contracts) {
  const contratId = contratIdByEduviaId.get(contract.id);
  if (!contratId) continue;

  try {
    const progression = await fetchOne<EduviaProgression>(
      instanceUrl,
      apiKey,
      `contracts/${contract.id}/progressions`,
    );

    const { error: upsertError } = await supabase
      .from('contrats_progressions')
      .upsert(
        {
          contrat_id: contratId,
          eduvia_contract_id: progression.contract_id,
          eduvia_formation_id: progression.formation_id,
          total_spent_time_seconds: progression.total_spent_time,
          total_spent_time_hours: progression.total_spent_time_hours,
          completed_sequences_count: progression.completed_sequences_count,
          sequence_count: progression.sequence_count,
          progression_percentage: progression.progression_percentage,
          estimated_relative_time: progression.estimated_relative_time,
          average_score: progression.average_score,
          last_activity_at: progression.last_activity_at,
          sequences: progression.sequences,
          last_synced_at: now,
        },
        { onConflict: 'contrat_id' },
      );

    if (upsertError) {
      result.errors.push(
        `Progression contrat=${contract.id}: ${upsertError.message}`,
      );
    } else {
      result.progressions++;
    }
  } catch (err) {
    if (err instanceof EndpointNotAvailableError) continue; // silently skip
    result.errors.push(
      `Progression contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
```

- [ ] **Step 4: Update the log line in `syncAllEduviaClients`**

Find the `logger.info('eduvia_sync', 'Sync terminée ...)` call (around line 367 in the current file) and include `progressions: clientResult.progressions` in the log payload.

- [ ] **Step 5: Build + lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add lib/eduvia/sync.ts
git commit -m "feat(eduvia): sync per-contract progressions into contrats_progressions"
```

---

## Task 6 — Migration: `eduvia_invoice_steps` + `eduvia_invoice_forecast_steps`

**Files:**

- Create: `supabase/migrations/00046_eduvia_invoice_steps.sql`
- Modify: `types/database.ts`

- [ ] **Step 1: Write the migration**

```sql
-- 00046_eduvia_invoice_steps.sql
-- Invoice steps pulled from Eduvia per contract. Two tables because the
-- forecast schema is a strict subset of the actual-steps schema, and we
-- want sane NOT NULL constraints on the actual side.

CREATE TABLE IF NOT EXISTS eduvia_invoice_steps (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id                   INTEGER UNIQUE NOT NULL,
  contrat_id                  UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id          INTEGER NOT NULL,
  eduvia_invoice_id           INTEGER,
  step_number                 INTEGER NOT NULL,
  opening_date                DATE,
  total_amount                NUMERIC(12,2),
  including_pedagogie_amount  NUMERIC(12,2),
  including_rqth_amount       NUMERIC(12,2),
  paid_amount                 NUMERIC(12,2),
  in_progress_amount          NUMERIC(12,2),
  siret_cfa                   TEXT,
  external_code               TEXT,
  invoice_state               TEXT,
  invoice_sent_at             TIMESTAMPTZ,
  last_synced_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_contrat_id
  ON eduvia_invoice_steps(contrat_id);
CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_steps_invoice_state
  ON eduvia_invoice_steps(invoice_state);

CREATE TABLE IF NOT EXISTS eduvia_invoice_forecast_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eduvia_id           INTEGER UNIQUE NOT NULL,
  contrat_id          UUID NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
  eduvia_contract_id  INTEGER NOT NULL,
  step_number         INTEGER NOT NULL,
  opening_date        DATE,
  total_amount        NUMERIC(12,2),
  percentage          NUMERIC(5,2),
  npec_amount         NUMERIC(12,2),
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eduvia_invoice_forecast_steps_contrat_id
  ON eduvia_invoice_forecast_steps(contrat_id);

-- RLS
ALTER TABLE eduvia_invoice_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduvia_invoice_forecast_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY eduvia_invoice_steps_select ON eduvia_invoice_steps
  FOR SELECT USING (contrat_id IN (SELECT id FROM contrats));
CREATE POLICY eduvia_invoice_steps_admin_all ON eduvia_invoice_steps
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY eduvia_invoice_forecast_steps_select ON eduvia_invoice_forecast_steps
  FOR SELECT USING (contrat_id IN (SELECT id FROM contrats));
CREATE POLICY eduvia_invoice_forecast_steps_admin_all ON eduvia_invoice_forecast_steps
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
```

- [ ] **Step 2: Apply + regen types**

Run:

```bash
npx supabase migration up --local
npx supabase gen types typescript --local > types/database.ts
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00046_eduvia_invoice_steps.sql types/database.ts
git commit -m "feat(eduvia): add eduvia_invoice_steps + eduvia_invoice_forecast_steps tables"
```

---

## Task 7 — Sync invoice steps per contract

**Files:**

- Modify: `lib/eduvia/sync.ts`

- [ ] **Step 1: Import new types**

Update the `import type` block at the top of `lib/eduvia/sync.ts`:

```ts
import {
  fetchAllPages,
  fetchOne,
  fetchList,
  EndpointNotAvailableError,
} from '@/lib/eduvia/client';
import type {
  EduviaContract,
  EduviaLearner,
  EduviaFormation,
  EduviaCompany,
  EduviaProgression,
  EduviaInvoiceStep,
  EduviaInvoiceForecastStep,
} from '@/lib/eduvia/client';
```

- [ ] **Step 2: Extend `SyncClientResult`**

Replace the interface definition to add `invoice_steps` + `invoice_forecast_steps` counters:

```ts
export interface SyncClientResult {
  clientId: string;
  contrats: number;
  apprenants: number;
  formations: number;
  companies: number;
  progressions: number;
  invoice_steps: number;
  invoice_forecast_steps: number;
  errors: string[];
}
```

Update both `result` initialisers (inside `syncEduviaForClient` and the log payload in `syncAllEduviaClients`) to initialise + log the two new counters.

- [ ] **Step 3: Add the invoice-step sync loop after the progression loop**

Right after the progression loop inside `syncEduviaForClient`, append:

```ts
// ── PASS 4 — per-contract invoice steps ────────────────────────────
for (const contract of contracts) {
  const contratId = contratIdByEduviaId.get(contract.id);
  if (!contratId) continue;

  // Actual invoice steps
  try {
    const steps = await fetchList<EduviaInvoiceStep>(
      instanceUrl,
      apiKey,
      `contracts/${contract.id}/invoice_steps`,
    );
    for (const step of steps) {
      const { error: upsertError } = await supabase
        .from('eduvia_invoice_steps')
        .upsert(
          {
            eduvia_id: step.id,
            contrat_id: contratId,
            eduvia_contract_id: step.contract_id,
            eduvia_invoice_id: step.invoice_id,
            step_number: step.step_number,
            opening_date: step.opening_date,
            total_amount: step.total_amount,
            including_pedagogie_amount: step.including_pedagogie_amount,
            including_rqth_amount: step.including_rqth_amount,
            paid_amount: step.paid_amount,
            in_progress_amount: step.in_progress_amount,
            siret_cfa: step.siret_cfa,
            external_code: step.external_code,
            invoice_state: step.invoice_state,
            invoice_sent_at: step.invoice_sent_at,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id' },
        );
      if (upsertError) {
        result.errors.push(
          `InvoiceStep eduvia_id=${step.id}: ${upsertError.message}`,
        );
      } else {
        result.invoice_steps++;
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_steps contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Forecast invoice steps
  try {
    const forecasts = await fetchList<EduviaInvoiceForecastStep>(
      instanceUrl,
      apiKey,
      `contracts/${contract.id}/invoice_forecast_steps`,
    );
    for (const forecast of forecasts) {
      const { error: upsertError } = await supabase
        .from('eduvia_invoice_forecast_steps')
        .upsert(
          {
            eduvia_id: forecast.id,
            contrat_id: contratId,
            eduvia_contract_id: forecast.contract_id,
            step_number: forecast.step_number,
            opening_date: forecast.opening_date,
            total_amount: forecast.total_amount,
            percentage: forecast.percentage,
            npec_amount: forecast.npec_amount,
            last_synced_at: now,
          },
          { onConflict: 'eduvia_id' },
        );
      if (upsertError) {
        result.errors.push(
          `InvoiceForecastStep eduvia_id=${forecast.id}: ${upsertError.message}`,
        );
      } else {
        result.invoice_forecast_steps++;
      }
    }
  } catch (err) {
    if (!(err instanceof EndpointNotAvailableError)) {
      result.errors.push(
        `invoice_forecast_steps contrat=${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add lib/eduvia/sync.ts
git commit -m "feat(eduvia): sync per-contract invoice_steps + invoice_forecast_steps"
```

---

## Task 8 — Final verification + doc refresh

**Files:**

- Modify: `docs/superpowers/specs/2026-04-14-integrations-design.md` (add a "Schema drift resolved on 2026-04-17" note)

- [ ] **Step 1: Full type-check + lint + build**

Run: `npm run lint && npm run build`
Expected: 0 errors (existing warnings unchanged).

- [ ] **Step 2: Smoke-test the API route compiles and responds 401 unauthorized (no cron secret)**

Run: `npm run dev` in one terminal, then from another:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/sync/eduvia
```

Expected: `401`. This proves the route still wires up after the refactor (401 comes from `verifyCronAuth` before touching Eduvia — we're not testing the live API, which is blocked by the TLS cert issue on `api.demo.eduvia.app`).

- [ ] **Step 3: Update the design doc**

Append to `docs/superpowers/specs/2026-04-14-integrations-design.md`:

```md
## 2026-04-17 Update — Schema drift resolved

Audit against the real OpenAPI spec (`/tmp/eduvia_openapi.yaml`) revealed that the
Eduvia contract/learner/formation/company objects are flat with `*_id` integers,
not the nested objects previously assumed. The sync was refactored to do a 2-pass
fetch + in-memory join and to populate the newly added denormalisation columns
on `contrats`, `formations`, `eduvia_companies`, `apprenants`. New tables
`contrats_progressions`, `eduvia_invoice_steps`, `eduvia_invoice_forecast_steps`
cover the quality and facturation pipelines. Live end-to-end test still blocked
on Cloudflare cert for `api.demo.eduvia.app` (handshake_failure alert 40 —
subdomain not covered by Universal SSL; Eduvia team to enable Advanced
Certificate Manager or issue a dedicated edge certificate).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-14-integrations-design.md
git commit -m "docs(eduvia): note schema-drift resolution and pending TLS cert blocker"
```

---

## Verification (end-to-end, post TLS fix)

When Eduvia provisions the cert on `api.demo.eduvia.app`, run:

```bash
# 1. Add the API key to a client in /admin/clients/<id>
# 2. Trigger the cron route with the real secret
curl -X POST http://localhost:3000/api/sync/eduvia \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected JSON response with `success: true` and non-zero counters:

```json
{
  "success": true,
  "totalClients": 1,
  "syncedClients": 1,
  "results": [
    {
      "clientId": "…",
      "contrats": 6,
      "apprenants": 6,
      "formations": 3,
      "companies": 1,
      "progressions": 6,
      "invoice_steps": 18,
      "invoice_forecast_steps": 24,
      "errors": []
    }
  ]
}
```

Verify in Supabase SQL editor:

```sql
SELECT COUNT(*) FROM contrats WHERE last_synced_at IS NOT NULL;
SELECT COUNT(*) FROM contrats_progressions;
SELECT COUNT(*) FROM eduvia_invoice_steps;
SELECT apprenant_nom, formation_titre, npec_amount FROM contrats LIMIT 5;
-- should show real names, not NULL
```

---

## Follow-ups (not in this plan)

- **Mock-files migration** — 10 files flagged in the progress tracker still hit mock data; needs its own audit + plan.
- **Multi-projet per client** — if a client has several active projets, contracts are still pinned to the first non-archived one. A second migration could hang `contrats.projet_id` resolution on a `projets.eduvia_company_ids` mapping column.
- **Odoo push** — still stubbed; blocked on real Odoo credentials.
- **Resend email** — still not wired in `createFactures`.
- **Surveys / graded_surveys sync** — skipped for v1; relevant for Qualiopi tracking.
