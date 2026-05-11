process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/absences.ts.
 *
 * Important : la requete utilise un range overlap (lte date_debut, gte
 * date_fin) - on verifie que ce predicat capture bien les absences qui
 * chevauchent la periode demandee, y compris en bord de fenetre.
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
  filters: Array<{ col: string; val: unknown; op: 'lte' | 'gte' }>;
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
        lte(col: string, val: unknown) {
          record.filters.push({ col, val, op: 'lte' });
          return chain;
        },
        gte(col: string, val: unknown) {
          record.filters.push({ col, val, op: 'gte' });
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

describe('getAbsencesForUserAndPeriod', () => {
  it('applique range overlap (date_debut <= fin AND date_fin >= debut)', async () => {
    const rows = [
      {
        id: 'a1',
        type: 'conges',
        date_debut: '2026-05-01',
        date_fin: '2026-05-15',
        demi_jour_debut: null,
        demi_jour_fin: null,
      },
    ];
    const { client, ops } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getAbsencesForUserAndPeriod } =
      await import('@/lib/queries/absences');
    const result = await getAbsencesForUserAndPeriod(
      '2026-05-10',
      '2026-05-20',
    );

    expect(result).toEqual(rows);
    const op = ops[0]!;
    expect(op.table).toBe('absences');
    expect(op.filters).toEqual([
      { col: 'date_debut', val: '2026-05-20', op: 'lte' },
      { col: 'date_fin', val: '2026-05-10', op: 'gte' },
    ]);
    expect(op.orders[0]).toEqual({ col: 'date_debut', ascending: true });
  });

  it('retourne [] si data null', async () => {
    const { client } = buildSupabase({ data: null });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getAbsencesForUserAndPeriod } =
      await import('@/lib/queries/absences');
    const result = await getAbsencesForUserAndPeriod(
      '2026-05-01',
      '2026-05-31',
    );
    expect(result).toEqual([]);
  });

  it('retourne [] (et logge) en cas d erreur supabase', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'rls denied' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getAbsencesForUserAndPeriod } =
      await import('@/lib/queries/absences');
    const result = await getAbsencesForUserAndPeriod(
      '2026-05-01',
      '2026-05-31',
    );
    expect(result).toEqual([]);
  });
});

describe('getAbsencesForCurrentYear', () => {
  it('cible 01-01 au 12-31 de l annee courante', async () => {
    const { client, ops } = buildSupabase({ data: [] });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getAbsencesForCurrentYear } =
      await import('@/lib/queries/absences');
    await getAbsencesForCurrentYear();

    const year = new Date().getFullYear();
    const op = ops[0]!;
    const fLte = op.filters.find((f) => f.op === 'lte');
    const fGte = op.filters.find((f) => f.op === 'gte');
    expect(fLte?.val).toBe(`${year}-12-31`);
    expect(fGte?.val).toBe(`${year}-01-01`);
  });
});
