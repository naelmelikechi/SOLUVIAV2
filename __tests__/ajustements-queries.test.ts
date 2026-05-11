process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/ajustements.ts.
 *
 * listAjustementsPending : filtre resolved_at IS NULL + tri created_at DESC.
 * delta_ht peut etre stocke en string (numeric DB) -> Number() coerce.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown; op: 'is' }>;
  orders: Array<{ col: string; ascending: boolean }>;
}

function buildSupabase(result: { data?: unknown; error?: unknown } = {}) {
  const ops: QueryRecord[] = [];
  const client = {
    from(table: string) {
      const record: QueryRecord = { table, filters: [], orders: [] };
      ops.push(record);
      const resolve = () =>
        Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      const chain: Record<string, unknown> = {
        select: () => chain,
        is(col: string, val: unknown) {
          record.filters.push({ col, val, op: 'is' });
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          record.orders.push({ col, ascending: opts?.ascending ?? true });
          return chain;
        },
        then: (cb: (v: unknown) => unknown) => resolve().then(cb),
      };
      return chain;
    },
  };
  return { client, ops };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listAjustementsPending', () => {
  it('filtre resolved_at IS NULL + ordre created_at DESC', async () => {
    const rows = [
      {
        id: 'a1',
        type: 'npec_change',
        delta_ht: '150.50',
        motif: 'NPEC revise',
        detail: { foo: 'bar' },
        created_at: '2026-05-11T10:00:00Z',
        contrat: { id: 'c1', apprenant_nom: 'X' },
        projet: { id: 'p1', ref: '0007-HEO' },
      },
    ];
    const { client, ops } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { listAjustementsPending } =
      await import('@/lib/queries/ajustements');
    const result = await listAjustementsPending();

    expect(result).toHaveLength(1);
    expect(result[0]!.delta_ht).toBe(150.5);
    expect(result[0]!.type).toBe('npec_change');
    const op = ops[0]!;
    expect(op.table).toBe('facturation_ajustements_pending');
    expect(op.filters).toEqual([{ col: 'resolved_at', val: null, op: 'is' }]);
    expect(op.orders[0]).toEqual({ col: 'created_at', ascending: false });
  });

  it('coerce delta_ht string -> number', async () => {
    const rows = [
      {
        id: 'a1',
        type: 'rupture',
        delta_ht: '-200',
        motif: null,
        detail: null,
        created_at: '2026-05-11T10:00:00Z',
        contrat: null,
        projet: null,
      },
    ];
    const { client } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { listAjustementsPending } =
      await import('@/lib/queries/ajustements');
    const result = await listAjustementsPending();
    expect(result[0]!.delta_ht).toBe(-200);
    expect(typeof result[0]!.delta_ht).toBe('number');
  });

  it('retourne [] en cas d erreur supabase', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'rls denied' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { listAjustementsPending } =
      await import('@/lib/queries/ajustements');
    const result = await listAjustementsPending();
    expect(result).toEqual([]);
  });

  it('retourne [] si data null', async () => {
    const { client } = buildSupabase({ data: null });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { listAjustementsPending } =
      await import('@/lib/queries/ajustements');
    const result = await listAjustementsPending();
    expect(result).toEqual([]);
  });
});
