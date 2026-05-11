process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/queries/passkeys.ts.
 *
 * getMyPasskeys utilise RLS pour filtrer cote DB - le code applicatif
 * n applique pas de eq(user_id) car RLS le fait. On verifie surtout
 * order created_at DESC + fallback [] sur erreur (UX qui ne casse pas).
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';

function buildSupabase(result: { data?: unknown; error?: unknown } = {}) {
  const ops: Array<{
    table: string;
    orders: Array<{ col: string; ascending: boolean }>;
  }> = [];
  const client = {
    from(table: string) {
      const record = {
        table,
        orders: [] as Array<{ col: string; ascending: boolean }>,
      };
      ops.push(record);
      const resolve = () =>
        Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      const chain: Record<string, unknown> = {
        select: () => chain,
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

describe('getMyPasskeys', () => {
  it('retourne les passkeys triees par created_at DESC', async () => {
    const rows = [
      {
        id: 'k1',
        device_name: 'iPhone',
        device_type: 'singleDevice',
        backed_up: true,
        transports: ['internal'],
        last_used_at: '2026-05-10',
        created_at: '2026-05-01',
      },
    ];
    const { client, ops } = buildSupabase({ data: rows });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getMyPasskeys } = await import('@/lib/queries/passkeys');
    const result = await getMyPasskeys();

    expect(result).toEqual(rows);
    const op = ops[0]!;
    expect(op.table).toBe('webauthn_credentials');
    expect(op.orders[0]).toEqual({ col: 'created_at', ascending: false });
  });

  it('retourne [] sur erreur supabase (UI ne casse pas)', async () => {
    const { client } = buildSupabase({
      data: null,
      error: { message: 'rls denied' },
    });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getMyPasskeys } = await import('@/lib/queries/passkeys');
    const result = await getMyPasskeys();
    expect(result).toEqual([]);
  });

  it('retourne [] si data null sans erreur', async () => {
    const { client } = buildSupabase({ data: null });
    vi.mocked(createClient).mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const { getMyPasskeys } = await import('@/lib/queries/passkeys');
    const result = await getMyPasskeys();
    expect(result).toEqual([]);
  });
});
