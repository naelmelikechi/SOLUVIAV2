import { describe, it, expect } from 'vitest';
import { waitForDb, DbUnreachableError } from '@/lib/supabase/db-wake';
import type { SupabaseClient } from '@supabase/supabase-js';

type Resp = { error: unknown };

function fakeClient(responses: Resp[]) {
  const state = { calls: 0 };
  const client = {
    from() {
      return {
        select() {
          const r = responses[Math.min(state.calls, responses.length - 1)];
          state.calls++;
          return Promise.resolve(r);
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, state };
}

const CONN = {
  message: 'TypeError: fetch failed',
  details: 'ConnectTimeoutError (UND_ERR_CONNECT_TIMEOUT)',
};

describe('waitForDb', () => {
  it('returns immediately when the DB answers', async () => {
    const { client, state } = fakeClient([{ error: null }]);
    await expect(waitForDb(client)).resolves.toBeUndefined();
    expect(state.calls).toBe(1);
  });

  it('retries on a connection error then proceeds once awake', async () => {
    const { client, state } = fakeClient([{ error: CONN }, { error: null }]);
    await waitForDb(client, { delaysMs: [1] });
    expect(state.calls).toBe(2);
  });

  it('throws DbUnreachableError when every attempt is a connection failure', async () => {
    const { client, state } = fakeClient([{ error: CONN }]);
    const err = await waitForDb(client, { delaysMs: [1, 1] }).catch((e) => e);
    expect(err).toBeInstanceOf(DbUnreachableError);
    expect((err as DbUnreachableError).attempts).toBe(3);
    expect(state.calls).toBe(3);
  });

  it('treats an application error as reachable (socket alive)', async () => {
    // PostgREST permission error => the DB answered; not a connection failure.
    const { client, state } = fakeClient([
      { error: { message: 'permission denied for table x', code: '42501' } },
    ]);
    await expect(
      waitForDb(client, { delaysMs: [1, 1] }),
    ).resolves.toBeUndefined();
    expect(state.calls).toBe(1);
  });
});
