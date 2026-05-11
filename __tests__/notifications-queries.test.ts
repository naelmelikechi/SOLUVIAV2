process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/notifications.ts.
 *
 * - getNotifications : throw AppError si non auth ; query filtre par user_id,
 *   order created_at DESC, limit 50.
 * - getUnreadCount : retourne 0 si non auth (au lieu de throw, pour ne pas
 *   casser le badge sidebar sur logout), filtre par user_id + read_at IS NULL.
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
  selectOpts?: { count?: string; head?: boolean };
  filters: Array<{ col: string; val: unknown; op: 'eq' | 'is' }>;
  orders: Array<{ col: string; ascending: boolean }>;
  limit?: number;
}

function buildSupabase(
  authUser: { id: string } | null,
  tableResult: { data?: unknown; count?: number | null; error?: unknown } = {},
) {
  const ops: QueryRecord[] = [];
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: authUser }, error: null }),
    },
    from(table: string) {
      return {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          const record: QueryRecord = {
            table,
            selectOpts: opts,
            filters: [],
            orders: [],
          };
          ops.push(record);
          const resolve = () =>
            Promise.resolve({
              data: tableResult.data ?? null,
              count: tableResult.count ?? null,
              error: tableResult.error ?? null,
            });
          const chain: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              record.filters.push({ col, val, op: 'eq' });
              return chain;
            },
            is(col: string, val: unknown) {
              record.filters.push({ col, val, op: 'is' });
              return chain;
            },
            order(col: string, opts2?: { ascending?: boolean }) {
              record.orders.push({ col, ascending: opts2?.ascending ?? true });
              return chain;
            },
            limit(n: number) {
              record.limit = n;
              return chain;
            },
            then: (cb: (v: unknown) => unknown) => resolve().then(cb),
          };
          return chain;
        },
      };
    },
  };
  return { client, ops };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getNotifications
// ---------------------------------------------------------------------------

describe('getNotifications', () => {
  it('throw AppError UNAUTHORIZED si pas de session', async () => {
    const { client } = buildSupabase(null);
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getNotifications } = await import('@/lib/queries/notifications');
    await expect(getNotifications()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('filtre par user_id, order created_at DESC, limit 50', async () => {
    const rows = [
      { id: 'n1', titre: 'A' },
      { id: 'n2', titre: 'B' },
    ];
    const { client, ops } = buildSupabase({ id: 'user-1' }, { data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getNotifications } = await import('@/lib/queries/notifications');
    const result = await getNotifications();

    expect(result).toEqual(rows);
    const op = ops[0]!;
    expect(op.table).toBe('notifications');
    expect(op.filters[0]).toEqual({ col: 'user_id', val: 'user-1', op: 'eq' });
    expect(op.orders[0]).toEqual({ col: 'created_at', ascending: false });
    expect(op.limit).toBe(50);
  });

  it('throw AppError NOTIFICATIONS_FETCH_FAILED si supabase echoue', async () => {
    const { client } = buildSupabase(
      { id: 'user-1' },
      { data: null, error: { message: 'boom' } },
    );
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getNotifications } = await import('@/lib/queries/notifications');
    await expect(getNotifications()).rejects.toMatchObject({
      code: 'NOTIFICATIONS_FETCH_FAILED',
    });
  });
});

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

describe('getUnreadCount', () => {
  it('retourne 0 si pas authentifie (au lieu de throw)', async () => {
    const { client } = buildSupabase(null);
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getUnreadCount } = await import('@/lib/queries/notifications');
    const count = await getUnreadCount();
    expect(count).toBe(0);
  });

  it('filtre par user_id + read_at IS NULL, count exact head', async () => {
    const { client, ops } = buildSupabase({ id: 'user-9' }, { count: 7 });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getUnreadCount } = await import('@/lib/queries/notifications');
    const count = await getUnreadCount();

    expect(count).toBe(7);
    const op = ops[0]!;
    expect(op.selectOpts).toEqual({ count: 'exact', head: true });
    expect(op.filters).toEqual([
      { col: 'user_id', val: 'user-9', op: 'eq' },
      { col: 'read_at', val: null, op: 'is' },
    ]);
  });

  it('retourne 0 si supabase echoue (au lieu de throw)', async () => {
    const { client } = buildSupabase(
      { id: 'user-1' },
      { count: null, error: { message: 'boom' } },
    );
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getUnreadCount } = await import('@/lib/queries/notifications');
    const count = await getUnreadCount();
    expect(count).toBe(0);
  });

  it('coerce count null vers 0', async () => {
    const { client } = buildSupabase({ id: 'user-1' }, { count: null });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getUnreadCount } = await import('@/lib/queries/notifications');
    const count = await getUnreadCount();
    expect(count).toBe(0);
  });
});
