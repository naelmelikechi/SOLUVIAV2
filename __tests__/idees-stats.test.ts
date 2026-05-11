process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/idees.ts > getIdeesStats.
 *
 * Verifie le bucketing des statuts (proposee/validee/implementee/rejetee)
 * et les filtres optionnels from/to (created_at gte/lt).
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
  filters: Array<{ col: string; val: unknown; op: 'gte' | 'lt' }>;
}

function buildSupabase(result: { data?: unknown; error?: unknown } = {}) {
  const ops: QueryRecord[] = [];
  const client = {
    from(table: string) {
      const record: QueryRecord = { table, filters: [] };
      ops.push(record);
      const resolve = () =>
        Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      const chain: Record<string, unknown> = {
        select: () => chain,
        gte(col: string, val: unknown) {
          record.filters.push({ col, val, op: 'gte' });
          return chain;
        },
        lt(col: string, val: unknown) {
          record.filters.push({ col, val, op: 'lt' });
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

describe('getIdeesStats', () => {
  it('compte les 4 statuts dans des buckets distincts', async () => {
    const rows = [
      { statut: 'proposee' },
      { statut: 'proposee' },
      { statut: 'validee' },
      { statut: 'implementee' },
      { statut: 'implementee' },
      { statut: 'implementee' },
      { statut: 'rejetee' },
    ];
    const { client } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getIdeesStats } = await import('@/lib/queries/idees');
    const stats = await getIdeesStats();

    expect(stats).toEqual({
      proposees: 2,
      validees: 1,
      implementees: 3,
      rejetees: 1,
    });
  });

  it('applique from -> gte(created_at) et to -> lt(created_at)', async () => {
    const { client, ops } = buildSupabase({ data: [] });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-04-01T00:00:00Z');

    const { getIdeesStats } = await import('@/lib/queries/idees');
    await getIdeesStats(from, to);

    const op = ops[0]!;
    expect(op.filters).toEqual([
      { col: 'created_at', val: from.toISOString(), op: 'gte' },
      { col: 'created_at', val: to.toISOString(), op: 'lt' },
    ]);
  });

  it('retourne tout a 0 en cas d erreur supabase (UI ne casse pas)', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'boom' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getIdeesStats } = await import('@/lib/queries/idees');
    const stats = await getIdeesStats();
    expect(stats).toEqual({
      proposees: 0,
      validees: 0,
      implementees: 0,
      rejetees: 0,
    });
  });

  it('ignore les statuts inconnus (defense en profondeur)', async () => {
    const rows = [
      { statut: 'proposee' },
      { statut: 'unknown_status' },
      { statut: 'validee' },
    ];
    const { client } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getIdeesStats } = await import('@/lib/queries/idees');
    const stats = await getIdeesStats();
    expect(stats.proposees).toBe(1);
    expect(stats.validees).toBe(1);
    expect(stats.implementees).toBe(0);
    expect(stats.rejetees).toBe(0);
  });
});
