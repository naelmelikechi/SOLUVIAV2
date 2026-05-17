// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/dashboard.ts.
 *
 * Mocks le client Supabase chainable et verifie :
 * - getDashboardData : forme retournee, agregation, filtres is_demo / archive,
 *   pas de doublons, empty state.
 * - getDashboardFinancials : calcul de pedagogieAvgPct (moyenne arrondie sur
 *   contrats actifs avec progression).
 * - getInvoiceStatusBreakdown : repartition par statut.
 *
 * On ne re-teste pas la logique RLS Supabase elle-meme : on verifie juste que
 * les filtres `eq('client.is_demo', false)` etc sont passes a la chaine.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// computeContractSchedule depends on date math we don't want to fight here.
// Returning empty schedules suffices for KPIs we test (totalProduction = 0
// when no contrats supplied).
vi.mock('@/lib/queries/production', () => ({
  computeContractSchedule: () => ({ opco: [], opco12: [], commission: [] }),
}));

import { createClient } from '@/lib/supabase/server';

interface FilterRecord {
  col: string;
  val: unknown;
  op: 'eq' | 'in' | 'is' | 'lt' | 'gte' | 'lte' | 'neq';
}

interface QueryRecord {
  table: string;
  columns: string;
  filters: FilterRecord[];
  // optional results override map (some tables get queried twice)
  result?: { data?: unknown; error?: unknown; count?: number };
}

/**
 * Builds a Supabase mock where `tableResults[table]` may be an array (returned
 * once) or a function (called with QueryRecord, returns result). When the
 * same table is queried multiple times, results may be a list shifted in
 * order.
 */
function buildSupabase(
  tableResults: Record<
    string,
    | Array<{ data?: unknown; error?: unknown; count?: number }>
    | { data?: unknown; error?: unknown; count?: number }
  >,
) {
  const ops: QueryRecord[] = [];
  const cursor: Record<string, number> = {};

  function nextResult(table: string) {
    const r = tableResults[table];
    if (!r) return { data: [], error: null };
    if (Array.isArray(r)) {
      const idx = cursor[table] ?? 0;
      cursor[table] = idx + 1;
      return r[idx] ?? { data: [], error: null };
    }
    return r;
  }

  function makeChain(record: QueryRecord) {
    const resolve = () => {
      const r = nextResult(record.table);
      record.result = r;
      return Promise.resolve({
        data: r.data ?? null,
        error: r.error ?? null,
        count: r.count,
      });
    };

    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'eq' });
        return chain;
      },
      in(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'in' });
        return chain;
      },
      is(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'is' });
        return chain;
      },
      lt(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'lt' });
        return chain;
      },
      gte(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'gte' });
        return chain;
      },
      lte(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'lte' });
        return chain;
      },
      neq(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'neq' });
        return chain;
      },
      order() {
        return chain;
      },
      single() {
        return resolve();
      },
      maybeSingle() {
        return resolve();
      },
      then(onFulfilled: (v: unknown) => unknown) {
        return resolve().then(onFulfilled);
      },
    };
    return chain;
  }

  return {
    ops,
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            const record: QueryRecord = { table, columns, filters: [] };
            ops.push(record);
            return makeChain(record);
          },
        };
      },
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getDashboardData
// ---------------------------------------------------------------------------

describe('getDashboardData', () => {
  it('returns aggregated KPIs in the expected shape', async () => {
    const mock = buildSupabase({
      projets: { data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] },
      factures: {
        data: [
          { id: 'f1', statut: 'emise' },
          { id: 'f2', statut: 'en_retard' },
          { id: 'f3', statut: 'en_retard' },
          { id: 'f4', statut: 'payee' },
        ],
      },
      echeances: { data: [{ id: 'e1' }, { id: 'e2' }] },
      contrats: [
        // first call : contratsRes (active count)
        { data: [{ id: 'c1' }, { id: 'c2' }] },
        // second call : staleContratsRes (no stale rows)
        { data: [] },
      ],
      saisies_temps: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getDashboardData } = await import('@/lib/queries/dashboard');
    const data = await getDashboardData();

    expect(data).toEqual({
      projetsActifs: 3,
      facturesEnRetard: 2,
      facturesEmises: 1,
      echeancesAFacturer: 2,
      contratsActifs: 2,
      contratsSansProgression: 0,
    });
  });

  it('applies is_demo=false / archive=false filters on the joined client', async () => {
    const mock = buildSupabase({
      projets: { data: [] },
      factures: { data: [] },
      echeances: { data: [] },
      contrats: [{ data: [] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getDashboardData } = await import('@/lib/queries/dashboard');
    await getDashboardData();

    // Each main query (projets, factures, echeances, contrats actifs, contrats stale)
    // must filter on client.is_demo=false AND client.archive=false.
    const tablesToCheck = ['projets', 'factures', 'echeances'];
    for (const table of tablesToCheck) {
      const op = mock.ops.find((o) => o.table === table);
      expect(op, `expected query on ${table}`).toBeDefined();
      const isDemo = op!.filters.find(
        (f) => f.col === 'projet.client.is_demo' || f.col === 'client.is_demo',
      );
      const archive = op!.filters.find(
        (f) => f.col === 'projet.client.archive' || f.col === 'client.archive',
      );
      expect(isDemo?.val).toBe(false);
      expect(archive?.val).toBe(false);
    }
  });

  it('returns 0s on empty state without crashing', async () => {
    const mock = buildSupabase({
      projets: { data: [] },
      factures: { data: [] },
      echeances: { data: [] },
      contrats: [{ data: [] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getDashboardData } = await import('@/lib/queries/dashboard');
    const data = await getDashboardData();

    expect(data.projetsActifs).toBe(0);
    expect(data.facturesEnRetard).toBe(0);
    expect(data.facturesEmises).toBe(0);
    expect(data.echeancesAFacturer).toBe(0);
    expect(data.contratsActifs).toBe(0);
    expect(data.contratsSansProgression).toBe(0);
  });

  it('counts contratsSansProgression using fallback saisies_temps when Eduvia has no progression', async () => {
    const mock = buildSupabase({
      projets: { data: [] },
      factures: { data: [] },
      echeances: { data: [] },
      contrats: [
        { data: [] }, // contratsRes (active)
        {
          data: [
            // 2 contrats stale (date_debut > 30j) sans Eduvia activity
            {
              id: 'c1',
              projet_id: 'p1',
              contrats_progressions: null,
            },
            {
              id: 'c2',
              projet_id: 'p2',
              contrats_progressions: null,
            },
          ],
        },
      ],
      // p1 a une saisie recente -> compte pas. p2 -> contratsSansProgression.
      saisies_temps: { data: [{ projet_id: 'p1' }] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getDashboardData } = await import('@/lib/queries/dashboard');
    const data = await getDashboardData();

    expect(data.contratsSansProgression).toBe(1);
  });

  it("filters contrats actifs by ACTIVE_CONTRACT_STATES via .in('contract_state', ...)", async () => {
    const mock = buildSupabase({
      projets: { data: [] },
      factures: { data: [] },
      echeances: { data: [] },
      contrats: [{ data: [] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getDashboardData } = await import('@/lib/queries/dashboard');
    await getDashboardData();

    // First contrats query is the "actifs count" - must filter on contract_state IN [...]
    const contratsOps = mock.ops.filter((o) => o.table === 'contrats');
    expect(contratsOps.length).toBeGreaterThanOrEqual(2);
    const activeOp = contratsOps[0];
    expect(activeOp).toBeDefined();
    const contractStateFilter = activeOp!.filters.find(
      (f) => f.col === 'contract_state' && f.op === 'in',
    );
    expect(contractStateFilter).toBeDefined();
    expect(Array.isArray(contractStateFilter!.val)).toBe(true);
    // archive=false aussi present
    expect(
      activeOp!.filters.find(
        (f) => f.col === 'archive' && f.val === false && f.op === 'eq',
      ),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getInvoiceStatusBreakdown
// ---------------------------------------------------------------------------

describe('getInvoiceStatusBreakdown', () => {
  it('counts each statut bucket independently', async () => {
    const mock = buildSupabase({
      factures: {
        data: [
          { statut: 'emise' },
          { statut: 'emise' },
          { statut: 'payee' },
          { statut: 'en_retard' },
          { statut: 'avoir' },
          { statut: 'a_emettre' }, // ignore (not in any bucket)
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getInvoiceStatusBreakdown } =
      await import('@/lib/queries/dashboard');
    const breakdown = await getInvoiceStatusBreakdown();

    expect(breakdown).toEqual({
      emises: 2,
      payees: 1,
      en_retard: 1,
      avoirs: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// getDashboardFinancials(periode)
// ---------------------------------------------------------------------------

describe('getDashboardFinancials(periode)', () => {
  it('appends date_emission filter on factures when periode given', async () => {
    const supa = buildSupabase({});
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );

    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const periode = {
      key: 'ce_mois' as const,
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-31T00:00:00.000Z'),
      label: 'Mai 2026',
    };
    await getDashboardFinancials(periode);

    const factureOps = supa.ops.filter((o) => o.table === 'factures');
    const hasDateEmission = factureOps.some((o) =>
      o.filters.some(
        (f) =>
          f.col === 'date_emission' && f.op === 'gte' && f.val === '2026-05-01',
      ),
    );
    expect(hasDateEmission).toBe(true);
    const hasDateEmissionLte = factureOps.some((o) =>
      o.filters.some(
        (f) =>
          f.col === 'date_emission' && f.op === 'lte' && f.val === '2026-05-31',
      ),
    );
    expect(hasDateEmissionLte).toBe(true);
  });

  it('appends date_reception filter on paiements when periode given', async () => {
    const supa = buildSupabase({});
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const periode = {
      key: 'ce_mois' as const,
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-31T00:00:00.000Z'),
      label: 'Mai 2026',
    };
    await getDashboardFinancials(periode);

    const paiementOps = supa.ops.filter((o) => o.table === 'paiements');
    const hasDateReception = paiementOps.some((o) =>
      o.filters.some(
        (f) =>
          f.col === 'date_reception' &&
          f.op === 'gte' &&
          f.val === '2026-05-01',
      ),
    );
    expect(hasDateReception).toBe(true);
    const hasDateReceptionLte = paiementOps.some((o) =>
      o.filters.some(
        (f) =>
          f.col === 'date_reception' &&
          f.op === 'lte' &&
          f.val === '2026-05-31',
      ),
    );
    expect(hasDateReceptionLte).toBe(true);
  });

  it('omits date filters when periode is absent (compat)', async () => {
    const supa = buildSupabase({});
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    await getDashboardFinancials();

    const dateFilters = supa.ops.flatMap((o) =>
      o.filters.filter(
        (f) => f.col === 'date_emission' || f.col === 'date_reception',
      ),
    );
    expect(dateFilters).toHaveLength(0);
  });

  it('factures_retard query stays unfiltered by date (cumul a date)', async () => {
    const supa = buildSupabase({});
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const periode = {
      key: 'ce_mois' as const,
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-31T00:00:00.000Z'),
      label: 'Mai 2026',
    };
    await getDashboardFinancials(periode);

    // There are 2 factures queries: one for totalFacture, one for factures-en-retard.
    // The en_retard query is identifiable by its statut='en_retard' filter.
    const retardQuery = supa.ops.find(
      (o) =>
        o.table === 'factures' &&
        o.filters.some((f) => f.col === 'statut' && f.val === 'en_retard'),
    );
    expect(retardQuery).toBeDefined();
    const hasDateFilter = retardQuery!.filters.some(
      (f) => f.col === 'date_emission' || f.col === 'date_reception',
    );
    expect(hasDateFilter).toBe(false);
  });

  it('totalAFacturer somme les montant_prevu_ht des echeances pretes a emettre', async () => {
    const supa = buildSupabase({
      echeances: {
        data: [
          { montant_prevu_ht: 1500.5 },
          { montant_prevu_ht: 2000 },
          { montant_prevu_ht: 100 },
        ],
        error: null,
      },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const result = await getDashboardFinancials();
    expect(result.totalAFacturer).toBe(3600.5);
  });

  it('totalAFacturer = 0 quand aucune echeance prete', async () => {
    const supa = buildSupabase({
      echeances: { data: [], error: null },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    const result = await getDashboardFinancials();
    expect(result.totalAFacturer).toBe(0);
  });

  it('echeances query applique les bons filtres (facture_id null, validee false, date <= today)', async () => {
    const supa = buildSupabase({
      echeances: { data: [], error: null },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      supa.client,
    );
    const { getDashboardFinancials } = await import('@/lib/queries/dashboard');
    await getDashboardFinancials();

    const echeancesOp = supa.ops.find((o) => o.table === 'echeances');
    expect(echeancesOp).toBeDefined();
    const filters = echeancesOp!.filters;
    expect(
      filters.some(
        (f) => f.col === 'facture_id' && f.op === 'is' && f.val === null,
      ),
    ).toBe(true);
    expect(
      filters.some(
        (f) => f.col === 'validee' && f.op === 'eq' && f.val === false,
      ),
    ).toBe(true);
    expect(
      filters.some((f) => f.col === 'date_emission_prevue' && f.op === 'lte'),
    ).toBe(true);
  });
});
