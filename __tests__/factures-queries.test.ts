// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/factures.ts.
 *
 * Couverture :
 * - getFactureByRef : retourne la facture (RLS-filtered cote DB) ou null sur
 *   erreur. Verifie le filtre `eq('ref', ...)`.
 * - getProjetActiveContratsForFacturation : retourne null si projet inexistant,
 *   structure attendue avec contrats archive=false.
 * - getFacturesList : tri (numero_seq DESC), exclusion brouillons / demo.
 * - getBrouillons : ne renvoie que statut='a_emettre', tri created_at ASC.
 * - getEcheancesPending : filtres facture_id IS NULL + validee=false + tri.
 *
 * NB: Le module n'expose pas de pagination explicite (limit/offset) ni de
 * filtre par statut user-controle - ces operations sont effectuees cote
 * UI/data-table apres fetch. Les tests "pagination" et "filtre statut"
 * du mandat sont donc adresses au mieux : on teste les filtres existants
 * (`statut='a_emettre'`, `statut='en_retard'`) et on it.skip ce qui n'est
 * pas implemente.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';

interface FilterRecord {
  col: string;
  val: unknown;
  op: 'eq' | 'in' | 'is' | 'lt' | 'gte' | 'lte' | 'neq';
}

interface OrderRecord {
  col: string;
  ascending: boolean;
}

interface QueryRecord {
  table: string;
  columns: string;
  filters: FilterRecord[];
  orders: OrderRecord[];
}

interface TableResult {
  data?: unknown;
  error?: unknown;
}

function buildSupabase(
  tableResults: Record<string, TableResult | TableResult[]>,
) {
  const ops: QueryRecord[] = [];
  const cursor: Record<string, number> = {};

  function nextResult(table: string): TableResult {
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
      return Promise.resolve({
        data: r.data ?? null,
        error: r.error ?? null,
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
      neq(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'neq' });
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        record.orders.push({ col, ascending: opts?.ascending ?? true });
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
            const record: QueryRecord = {
              table,
              columns,
              filters: [],
              orders: [],
            };
            ops.push(record);
            return makeChain(record);
          },
        };
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getFactureByRef
// ---------------------------------------------------------------------------

describe('getFactureByRef', () => {
  it('returns the facture matching the ref', async () => {
    const fac = {
      id: 'fac-1',
      ref: 'FAC-DUP-0042',
      numero_seq: 42,
      statut: 'emise',
      montant_ht: 1000,
    };
    const mock = buildSupabase({ factures: { data: fac } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFactureByRef } = await import('@/lib/queries/factures');
    const result = await getFactureByRef('FAC-DUP-0042');

    expect(result).toEqual(fac);
    const op = mock.ops.find((o) => o.table === 'factures');
    expect(op).toBeDefined();
    const refFilter = op!.filters.find((f) => f.col === 'ref');
    expect(refFilter?.val).toBe('FAC-DUP-0042');
  });

  it('returns null when supabase returns an error (e.g. RLS denies row)', async () => {
    const mock = buildSupabase({
      factures: { data: null, error: { message: 'no rows' } },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFactureByRef } = await import('@/lib/queries/factures');
    const result = await getFactureByRef('FAC-UNKNOWN-9999');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getProjetActiveContratsForFacturation
// ---------------------------------------------------------------------------

describe('getProjetActiveContratsForFacturation', () => {
  it('returns null when projet does not exist', async () => {
    const mock = buildSupabase({
      projets: { data: null },
      contrats: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getProjetActiveContratsForFacturation } =
      await import('@/lib/queries/factures');
    const result = await getProjetActiveContratsForFacturation('p-missing');

    expect(result).toBeNull();
  });

  it('filters contrats by archive=false on the requested projet', async () => {
    const mock = buildSupabase({
      projets: {
        data: {
          id: 'p1',
          ref: '0042-DUP-APP',
          taux_commission: 12,
          billing_mode: 'auto',
          client_id: 'c1',
          client: { id: 'c1', raison_sociale: 'Acme SAS' },
        },
      },
      contrats: {
        data: [
          {
            id: 'k1',
            ref: 'CTR-00001',
            apprenant_nom: 'Doe',
            contract_state: 'actif',
          },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getProjetActiveContratsForFacturation } =
      await import('@/lib/queries/factures');
    const result = await getProjetActiveContratsForFacturation('p1');

    expect(result).not.toBeNull();
    expect(result!.projetRef).toBe('0042-DUP-APP');
    expect(result!.tauxCommission).toBe(12);
    expect(result!.billingMode).toBe('auto');
    expect(result!.contrats).toHaveLength(1);

    const contratsOp = mock.ops.find((o) => o.table === 'contrats');
    expect(contratsOp).toBeDefined();
    expect(
      contratsOp!.filters.find(
        (f) => f.col === 'projet_id' && f.val === 'p1' && f.op === 'eq',
      ),
    ).toBeDefined();
    expect(
      contratsOp!.filters.find(
        (f) => f.col === 'archive' && f.val === false && f.op === 'eq',
      ),
    ).toBeDefined();
  });

  it('uses default taux_commission=10 when projet.taux_commission is null', async () => {
    const mock = buildSupabase({
      projets: {
        data: {
          id: 'p1',
          ref: '0001-FOO-APP',
          taux_commission: null,
          billing_mode: 'manual',
          client_id: 'c1',
          client: { id: 'c1', raison_sociale: 'Foo SARL' },
        },
      },
      contrats: { data: [] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getProjetActiveContratsForFacturation } =
      await import('@/lib/queries/factures');
    const result = await getProjetActiveContratsForFacturation('p1');

    expect(result).not.toBeNull();
    expect(result!.tauxCommission).toBe(10);
    expect(result!.billingMode).toBe('manual');
    expect(result!.contrats).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFacturesList - tri + exclusion brouillons + filtre demo
// ---------------------------------------------------------------------------

describe('getFacturesList', () => {
  it("orders by numero_seq DESC and excludes brouillons (statut='a_emettre')", async () => {
    const mock = buildSupabase({
      factures: {
        data: [
          { id: 'f2', ref: 'FAC-DUP-0002', numero_seq: 2, statut: 'emise' },
          { id: 'f1', ref: 'FAC-DUP-0001', numero_seq: 1, statut: 'payee' },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesList } = await import('@/lib/queries/factures');
    const result = await getFacturesList();

    expect(result).toHaveLength(2);
    const op = mock.ops.find((o) => o.table === 'factures');
    expect(op).toBeDefined();

    // tri numero_seq DESC
    const order = op!.orders.find((o) => o.col === 'numero_seq');
    expect(order).toBeDefined();
    expect(order!.ascending).toBe(false);

    // exclusion brouillons via neq
    const neqStatut = op!.filters.find(
      (f) => f.col === 'statut' && f.op === 'neq',
    );
    expect(neqStatut?.val).toBe('a_emettre');

    // exclusion clients archives uniquement. Le filtre is_demo a ete retire
    // (commit 5e90f01) : les clients demo restent visibles dans l onglet
    // Factures, leur push Odoo en is_draft=true gere le risque comptable.
    expect(
      op!.filters.find(
        (f) => f.col === 'client.is_demo' && f.val === false && f.op === 'eq',
      ),
    ).toBeUndefined();
    expect(
      op!.filters.find(
        (f) => f.col === 'client.archive' && f.val === false && f.op === 'eq',
      ),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getBrouillons - filtre statut='a_emettre', tri ASC
// ---------------------------------------------------------------------------

describe('getBrouillons', () => {
  it("filters statut='a_emettre' and orders by created_at ASC", async () => {
    const mock = buildSupabase({
      factures: { data: [{ id: 'b1' }] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBrouillons } = await import('@/lib/queries/factures');
    const result = await getBrouillons();

    expect(result).toHaveLength(1);
    const op = mock.ops.find((o) => o.table === 'factures');
    expect(op).toBeDefined();
    const statut = op!.filters.find((f) => f.col === 'statut' && f.op === 'eq');
    expect(statut?.val).toBe('a_emettre');
    const order = op!.orders.find((o) => o.col === 'created_at');
    expect(order).toBeDefined();
    expect(order!.ascending).toBe(true);
  });

  it('returns [] on supabase error (no throw)', async () => {
    const mock = buildSupabase({
      factures: { data: null, error: { message: 'boom' } },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBrouillons } = await import('@/lib/queries/factures');
    const result = await getBrouillons();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEcheancesPending - facture_id IS NULL + validee=false
// ---------------------------------------------------------------------------

describe('getEcheancesPending', () => {
  it('filters facture_id IS NULL and validee=false', async () => {
    const mock = buildSupabase({
      echeances: {
        data: [
          { id: 'e1', mois_concerne: '2026-05-01', validee: false },
          { id: 'e2', mois_concerne: '2026-06-01', validee: false },
        ],
      },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getEcheancesPending } = await import('@/lib/queries/factures');
    const result = await getEcheancesPending();

    expect(result).toHaveLength(2);
    const op = mock.ops.find((o) => o.table === 'echeances');
    expect(op).toBeDefined();
    const isNull = op!.filters.find(
      (f) => f.col === 'facture_id' && f.op === 'is',
    );
    expect(isNull?.val).toBeNull();
    const validee = op!.filters.find(
      (f) => f.col === 'validee' && f.op === 'eq',
    );
    expect(validee?.val).toBe(false);
    // tri par date_emission_prevue
    expect(
      op!.orders.find((o) => o.col === 'date_emission_prevue'),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Mandat : pagination + filtre statut explicite
// Le module factures.ts n'expose pas (au moment de l'ecriture des tests) de
// helper avec limit/offset ni de filtre statut parametre par l'appelant.
// Ces capacites sont assurees cote UI / DataTable apres fetch. On documente
// donc les attentes via it.skip pour qu'elles soient adressees si une telle
// API est ajoutee plus tard.
// ---------------------------------------------------------------------------

describe('factures.ts - capabilites non implementees', () => {
  it.skip('supports a limit/offset pagination signature', () => {
    // Aucun helper exporte n'accepte limit/offset.
    // A activer si on ajoute getFacturesPage(limit, offset).
  });

  it.skip('supports a parametric filter by statut (a_emettre, emise, payee)', () => {
    // Les filtres statut existent mais sont hardcodes par helper
    // (getBrouillons -> a_emettre, getFacturesList -> != a_emettre, etc).
    // A activer si on expose getFacturesByStatut(statut).
  });
});
