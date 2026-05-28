process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/actions/notifications.ts.
 *
 * Couvre :
 * - markNotificationRead : validation UUID, guard user, eq(id) + eq(user_id)
 *   defense en profondeur contre un user qui forgerait l ID
 * - markAllNotificationsRead : eq(user_id) + is(read_at, null) - lecture seule
 *   des notifs non-lues du user courant
 * - deleteNotification : meme defense en profondeur
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/auth/guards';

const VALID_UUID = '11111111-1111-4111-a111-111111111111';

interface FilterCall {
  col: string;
  val: unknown;
  op: 'eq' | 'is';
}

function buildSupabase(opResult: { error?: { message: string } | null } = {}) {
  const calls: Array<{
    table: string;
    method: 'update' | 'delete';
    values?: Record<string, unknown>;
    filters: FilterCall[];
  }> = [];
  const client = {
    from(table: string) {
      function makeChain(
        method: 'update' | 'delete',
        values?: Record<string, unknown>,
      ) {
        const record = { table, method, values, filters: [] as FilterCall[] };
        calls.push(record);
        const chain = {
          eq(col: string, val: unknown) {
            record.filters.push({ col, val, op: 'eq' });
            return chainThenable();
          },
          is(col: string, val: unknown) {
            record.filters.push({ col, val, op: 'is' });
            return chainThenable();
          },
        };
        function chainThenable() {
          return {
            eq: chain.eq,
            is: chain.is,
            then: (onFulfilled: (v: unknown) => unknown) =>
              Promise.resolve({ error: opResult.error ?? null }).then(
                onFulfilled,
              ),
          };
        }
        return chain;
      }
      return {
        update(values: Record<string, unknown>) {
          return makeChain('update', values);
        },
        delete() {
          return makeChain('delete');
        },
      };
    },
  };
  return { client, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// markNotificationRead
// ---------------------------------------------------------------------------

describe('markNotificationRead', () => {
  it('rejette UUID invalide', async () => {
    const { markNotificationRead } =
      await import('@/lib/actions/notifications');
    const res = await markNotificationRead('pas-un-uuid');
    expect(res.success).toBe(false);
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it('non authentifie -> 403', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      ok: false,
      error: 'Non authentifié',
    });
    const { markNotificationRead } =
      await import('@/lib/actions/notifications');
    const res = await markNotificationRead(VALID_UUID);
    expect(res).toEqual({ success: false, error: 'Non authentifié' });
  });

  it('filtre par id ET user_id (defense en profondeur)', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
    });

    const { markNotificationRead } =
      await import('@/lib/actions/notifications');
    const res = await markNotificationRead(VALID_UUID);

    expect(res).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.table).toBe('notifications');
    expect(c.method).toBe('update');
    expect(c.values?.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.filters).toEqual([
      { col: 'id', val: VALID_UUID, op: 'eq' },
      { col: 'user_id', val: 'user-1', op: 'eq' },
    ]);
  });

  it('relaye erreur supabase', async () => {
    const { client } = buildSupabase({ error: { message: 'boom' } });
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
    });

    const { markNotificationRead } =
      await import('@/lib/actions/notifications');
    const res = await markNotificationRead(VALID_UUID);
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

// ---------------------------------------------------------------------------
// markAllNotificationsRead
// ---------------------------------------------------------------------------

describe('markAllNotificationsRead', () => {
  it('non authentifie -> 403', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      ok: false,
      error: 'Non authentifié',
    });
    const { markAllNotificationsRead } =
      await import('@/lib/actions/notifications');
    const res = await markAllNotificationsRead();
    expect(res).toEqual({ success: false, error: 'Non authentifié' });
  });

  it('filtre par user_id + read_at IS NULL', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-7' } as any,
    });

    const { markAllNotificationsRead } =
      await import('@/lib/actions/notifications');
    const res = await markAllNotificationsRead();

    expect(res).toEqual({ success: true });
    const c = calls[0]!;
    expect(c.method).toBe('update');
    expect(c.values?.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.filters).toEqual([
      { col: 'user_id', val: 'user-7', op: 'eq' },
      { col: 'read_at', val: null, op: 'is' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// deleteNotification
// ---------------------------------------------------------------------------

describe('deleteNotification', () => {
  it('rejette UUID invalide', async () => {
    const { deleteNotification } = await import('@/lib/actions/notifications');
    const res = await deleteNotification('pas-un-uuid');
    expect(res.success).toBe(false);
    expect(requireAuth).not.toHaveBeenCalled();
  });

  it('non authentifie -> 403', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      ok: false,
      error: 'Non authentifié',
    });
    const { deleteNotification } = await import('@/lib/actions/notifications');
    const res = await deleteNotification(VALID_UUID);
    expect(res).toEqual({ success: false, error: 'Non authentifié' });
  });

  it('DELETE filtre par id ET user_id (defense en profondeur)', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-9' } as any,
    });

    const { deleteNotification } = await import('@/lib/actions/notifications');
    const res = await deleteNotification(VALID_UUID);

    expect(res).toEqual({ success: true });
    const c = calls[0]!;
    expect(c.method).toBe('delete');
    expect(c.filters).toEqual([
      { col: 'id', val: VALID_UUID, op: 'eq' },
      { col: 'user_id', val: 'user-9', op: 'eq' },
    ]);
  });
});
