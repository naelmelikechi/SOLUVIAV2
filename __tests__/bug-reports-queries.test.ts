process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/bug-reports.ts.
 *
 * Couvre :
 * - getBugReports(filter) : filtres open/closed/all + order + limit
 * - getBugReportCounts() : 3 queries en parallele, projection { open, closed, all }
 * - getBugReportByRef(ref) : retourne null si error, sinon data
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
  op: 'eq' | 'in';
}

interface OrderRecord {
  col: string;
  ascending: boolean;
}

interface QueryRecord {
  table: string;
  columns: string;
  selectOpts?: { count?: string; head?: boolean };
  filters: FilterRecord[];
  orders: OrderRecord[];
  limit?: number;
}

interface TableResult {
  data?: unknown;
  count?: number | null;
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
        count: r.count ?? null,
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
      order(col: string, opts?: { ascending?: boolean }) {
        record.orders.push({ col, ascending: opts?.ascending ?? true });
        return chain;
      },
      limit(n: number) {
        record.limit = n;
        return chain;
      },
      single() {
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
              selectOpts: opts,
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
// getBugReports
// ---------------------------------------------------------------------------

describe('getBugReports', () => {
  it('filtre par defaut sur statuts "open" (nouveau + en_cours)', async () => {
    const rows = [
      { id: 'b1', ref: 'BUG-001', status: 'nouveau' },
      { id: 'b2', ref: 'BUG-002', status: 'en_cours' },
    ];
    const mock = buildSupabase({ bug_reports: { data: rows } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReports } = await import('@/lib/queries/bug-reports');
    const result = await getBugReports();

    expect(result).toEqual(rows);
    const op = mock.ops[0]!;
    expect(op.table).toBe('bug_reports');
    expect(op.filters.find((f) => f.col === 'archive')?.val).toBe(false);
    const statusFilter = op.filters.find((f) => f.col === 'status');
    expect(statusFilter?.op).toBe('in');
    expect(statusFilter?.val).toEqual(['nouveau', 'en_cours']);
    expect(op.orders[0]).toEqual({ col: 'created_at', ascending: false });
    expect(op.limit).toBe(200);
  });

  it('filtre "closed" applique in(status, [resolu, wontfix])', async () => {
    const mock = buildSupabase({ bug_reports: { data: [] } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReports } = await import('@/lib/queries/bug-reports');
    await getBugReports('closed');

    const statusFilter = mock.ops[0]!.filters.find((f) => f.col === 'status');
    expect(statusFilter?.op).toBe('in');
    expect(statusFilter?.val).toEqual(['resolu', 'wontfix']);
  });

  it('filtre "all" n applique pas de filtre status', async () => {
    const mock = buildSupabase({ bug_reports: { data: [] } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReports } = await import('@/lib/queries/bug-reports');
    await getBugReports('all');

    const statusFilter = mock.ops[0]!.filters.find((f) => f.col === 'status');
    expect(statusFilter).toBeUndefined();
    expect(mock.ops[0]!.filters.find((f) => f.col === 'archive')?.val).toBe(
      false,
    );
  });

  it('throw si supabase renvoie une erreur', async () => {
    const mock = buildSupabase({
      bug_reports: { data: null, error: { message: 'rls denied' } },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReports } = await import('@/lib/queries/bug-reports');
    await expect(getBugReports()).rejects.toMatchObject({
      message: 'rls denied',
    });
  });

  it('retourne [] si data null sans erreur', async () => {
    const mock = buildSupabase({ bug_reports: { data: null } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReports } = await import('@/lib/queries/bug-reports');
    const result = await getBugReports();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getBugReportCounts
// ---------------------------------------------------------------------------

describe('getBugReportCounts', () => {
  it('renvoie { open, closed, all } depuis 3 queries count: exact head: true', async () => {
    const mock = buildSupabase({
      bug_reports: [{ count: 5 }, { count: 12 }, { count: 17 }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReportCounts } = await import('@/lib/queries/bug-reports');
    const result = await getBugReportCounts();

    expect(result).toEqual({ open: 5, closed: 12, all: 17 });
    expect(mock.ops).toHaveLength(3);
    for (const op of mock.ops) {
      expect(op.selectOpts).toEqual({ count: 'exact', head: true });
      expect(op.filters.find((f) => f.col === 'archive')?.val).toBe(false);
    }
    expect(mock.ops[0]!.filters.find((f) => f.col === 'status')?.val).toEqual([
      'nouveau',
      'en_cours',
    ]);
    expect(mock.ops[1]!.filters.find((f) => f.col === 'status')?.val).toEqual([
      'resolu',
      'wontfix',
    ]);
    expect(
      mock.ops[2]!.filters.find((f) => f.col === 'status'),
    ).toBeUndefined();
  });

  it('coerce count null vers 0', async () => {
    const mock = buildSupabase({
      bug_reports: [{ count: null }, { count: null }, { count: null }],
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReportCounts } = await import('@/lib/queries/bug-reports');
    const result = await getBugReportCounts();
    expect(result).toEqual({ open: 0, closed: 0, all: 0 });
  });
});

// ---------------------------------------------------------------------------
// getBugReportByRef
// ---------------------------------------------------------------------------

describe('getBugReportByRef', () => {
  it('retourne la ligne quand trouvee', async () => {
    const row = { id: 'b1', ref: 'BUG-042', status: 'nouveau' };
    const mock = buildSupabase({ bug_reports: { data: row } });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReportByRef } = await import('@/lib/queries/bug-reports');
    const result = await getBugReportByRef('BUG-042');

    expect(result).toEqual(row);
    expect(mock.ops[0]!.filters.find((f) => f.col === 'ref')?.val).toBe(
      'BUG-042',
    );
  });

  it('retourne null en cas d erreur (RLS denied / not found)', async () => {
    const mock = buildSupabase({
      bug_reports: { data: null, error: { message: 'not found' } },
    });
    vi.mocked(createClient).mockResolvedValue(
      mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getBugReportByRef } = await import('@/lib/queries/bug-reports');
    const result = await getBugReportByRef('BUG-XXX');
    expect(result).toBeNull();
  });
});
