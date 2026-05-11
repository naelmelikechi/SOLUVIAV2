process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
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
        eq(col: string, val: unknown) {
          record.filters.push({ col, val });
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

describe('getRdvFormateursByProjetId', () => {
  it('filtre par projet_id + order date_prevue DESC', async () => {
    const rows = [{ id: 'r1', date_prevue: '2026-05-15' }];
    const { client, ops } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getRdvFormateursByProjetId } = await import('@/lib/queries/rdv');
    const result = await getRdvFormateursByProjetId('p-1');

    expect(result).toEqual(rows);
    const op = ops[0]!;
    expect(op.table).toBe('rdv_formateurs');
    expect(op.filters[0]).toEqual({ col: 'projet_id', val: 'p-1' });
    expect(op.orders[0]).toEqual({ col: 'date_prevue', ascending: false });
  });

  it('throw AppError RDV_FETCH_FAILED si supabase echoue', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'boom' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getRdvFormateursByProjetId } = await import('@/lib/queries/rdv');
    await expect(getRdvFormateursByProjetId('p-1')).rejects.toMatchObject({
      code: 'RDV_FETCH_FAILED',
    });
  });

  it('retourne [] si data null sans erreur', async () => {
    const { client } = buildSupabase({ data: null });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getRdvFormateursByProjetId } = await import('@/lib/queries/rdv');
    const result = await getRdvFormateursByProjetId('p-1');
    expect(result).toEqual([]);
  });
});

describe('getRdvCommerciauxByProspectId', () => {
  it('filtre par prospect_id + order date_prevue DESC', async () => {
    const rows = [{ id: 'r2', date_prevue: '2026-06-01' }];
    const { client, ops } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getRdvCommerciauxByProspectId } = await import('@/lib/queries/rdv');
    const result = await getRdvCommerciauxByProspectId('pros-1');

    expect(result).toEqual(rows);
    const op = ops[0]!;
    expect(op.table).toBe('rdv_commerciaux');
    expect(op.filters[0]).toEqual({ col: 'prospect_id', val: 'pros-1' });
    expect(op.orders[0]).toEqual({ col: 'date_prevue', ascending: false });
  });

  it('throw AppError RDV_FETCH_FAILED si supabase echoue', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'rls denied' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getRdvCommerciauxByProspectId } = await import('@/lib/queries/rdv');
    await expect(getRdvCommerciauxByProspectId('pros-1')).rejects.toMatchObject(
      { code: 'RDV_FETCH_FAILED' },
    );
  });
});
