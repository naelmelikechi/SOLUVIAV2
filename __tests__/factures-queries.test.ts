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
  ors: string[];
  ilikes: { col: string; val: string }[];
  limits: number[];
  count?: string;
  head?: boolean;
}

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
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
      neq(col: string, val: unknown) {
        record.filters.push({ col, val, op: 'neq' });
        return chain;
      },
      or(expr: string) {
        record.ors.push(expr);
        return chain;
      },
      ilike(col: string, val: string) {
        record.ilikes.push({ col, val });
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        record.orders.push({ col, ascending: opts?.ascending ?? true });
        return chain;
      },
      limit(n: number) {
        record.limits.push(n);
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
          select(columns: string, opts?: { count?: string; head?: boolean }) {
            const record: QueryRecord = {
              table,
              columns,
              filters: [],
              orders: [],
              ors: [],
              ilikes: [],
              limits: [],
              count: opts?.count,
              head: opts?.head,
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
    expect(result!.contrats).toEqual([]);
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

  it('borne la requete a 500 lignes (.limit(500))', async () => {
    const mock = buildSupabase({
      factures: { data: [{ id: 'b1' }] },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBrouillons } = await import('@/lib/queries/factures');
    await getBrouillons();

    const op = mock.ops.find((o) => o.table === 'factures');
    expect(op!.limits).toContain(500);
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
// getFacturesPage - pagination serveur keyset (numero_seq DESC, id DESC)
// ---------------------------------------------------------------------------

describe('getFacturesPage', () => {
  it('keyset page 1 : order seq/id DESC, limit+1, pas de .or, count exact', async () => {
    const mock = buildSupabase({
      factures: [{ data: [{ id: 'f2', numero_seq: 2 }] }, { count: 7 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    const page = await getFacturesPage({ limit: 2 });

    const dataOp = mock.ops[0]!;
    // tri sur les 2 cles
    expect(dataOp.orders[0]).toEqual({ col: 'numero_seq', ascending: false });
    expect(dataOp.orders[1]).toEqual({ col: 'id', ascending: false });
    // limit + 1
    expect(dataOp.limits).toContain(3);
    // pas de curseur -> pas de .or
    expect(dataOp.ors).toHaveLength(0);
    // count exact head sur la 2e requete
    const countOp = mock.ops[1]!;
    expect(countOp.count).toBe('exact');
    expect(countOp.head).toBe(true);
    expect(page.total).toBe(7);
    // invariants preserves
    expect(
      dataOp.filters.find((f) => f.col === 'statut' && f.op === 'neq')?.val,
    ).toBe('a_emettre');
    expect(
      dataOp.filters.find((f) => f.col === 'client.archive' && f.op === 'eq')
        ?.val,
    ).toBe(false);
  });

  it('nextCursor non-null quand limit+1 lignes recues (3 pour limit 2)', async () => {
    const mock = buildSupabase({
      factures: [
        {
          data: [
            { id: '33333333-3333-4333-8333-333333333333', numero_seq: 3 },
            { id: '22222222-2222-4222-8222-222222222222', numero_seq: 2 },
            { id: '11111111-1111-4111-8111-111111111111', numero_seq: 1 },
          ],
        },
        { count: 3 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage, decodeCursor } =
      await import('@/lib/queries/factures');
    const page = await getFacturesPage({ limit: 2 });

    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    // curseur = derniere ligne conservee (f2, seq 2)
    expect(decodeCursor(page.nextCursor)).toEqual({
      s: 2,
      i: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('derniere page : nextCursor null quand limit lignes recues', async () => {
    const mock = buildSupabase({
      factures: [
        {
          data: [
            { id: 'f2', numero_seq: 2 },
            { id: 'f1', numero_seq: 1 },
          ],
        },
        { count: 2 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    const page = await getFacturesPage({ limit: 2 });

    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('page 2 : curseur fourni -> .or emis, aucun count (total null)', async () => {
    const mock = buildSupabase({
      factures: [{ data: [{ id: 'f1', numero_seq: 1 }] }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage, encodeCursor } =
      await import('@/lib/queries/factures');
    const cursor = encodeCursor({
      s: 2,
      i: '22222222-2222-4222-8222-222222222222',
    });
    const page = await getFacturesPage({ limit: 2, cursor });

    const dataOp = mock.ops[0]!;
    expect(dataOp.ors).toContain(
      'numero_seq.lt.2,and(numero_seq.eq.2,id.lt.22222222-2222-4222-8222-222222222222)',
    );
    // une seule requete : aucun count
    expect(mock.ops).toHaveLength(1);
    expect(page.total).toBeNull();
  });

  it('filtre statut -> .in(statut, [...])', async () => {
    const mock = buildSupabase({
      factures: [{ data: [] }, { count: 0 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    await getFacturesPage({ limit: 2, statuts: ['emise', 'payee'] });

    const dataOp = mock.ops[0]!;
    const inStatut = dataOp.filters.find(
      (f) => f.col === 'statut' && f.op === 'in',
    );
    expect(inStatut?.val).toEqual(['emise', 'payee']);
  });

  it('recherche ref -> .ilike(ref, %...%)', async () => {
    const mock = buildSupabase({
      factures: [{ data: [] }, { count: 0 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    await getFacturesPage({ limit: 2, searchRef: 'FAC-SOL-0007' });

    const dataOp = mock.ops[0]!;
    expect(dataOp.ilikes).toContainEqual({
      col: 'ref',
      val: '%FAC-SOL-0007%',
    });
  });

  it('filtres projet/client -> .ilike sur projet.ref et client.raison_sociale', async () => {
    const mock = buildSupabase({
      factures: [{ data: [] }, { count: 0 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    await getFacturesPage({
      limit: 2,
      filterProjet: 'ACME',
      filterClient: 'Dupont',
    });

    const dataOp = mock.ops[0]!;
    expect(dataOp.ilikes).toContainEqual({
      col: 'projet.ref',
      val: '%ACME%',
    });
    expect(dataOp.ilikes).toContainEqual({
      col: 'client.raison_sociale',
      val: '%Dupont%',
    });
  });

  it('curseur invalide -> repart page 1 (pas de .or) et recompte le total', async () => {
    const mock = buildSupabase({
      factures: [{ data: [{ id: 'f1', numero_seq: 1 }] }, { count: 4 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getFacturesPage } = await import('@/lib/queries/factures');
    const page = await getFacturesPage({ limit: 2, cursor: 'pas-du-base64' });

    const dataOp = mock.ops[0]!;
    // curseur invalide -> pas de predicat keyset
    expect(dataOp.ors).toHaveLength(0);
    // curseur invalide = on repart page 1 -> le count est declenche (gate sur
    // le curseur DECODE, undefined ici) et le total est recalcule.
    expect(page.total).toBe(4);
  });
});
