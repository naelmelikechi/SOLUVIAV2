import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { isoWeekKey, tryAcquireEmailLock } from '@/lib/email/send-log';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

function makeSupabaseStub(insertResult: { error: { code: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    insert,
    from,
  };
}

describe('isoWeekKey', () => {
  it('returns ISO year + week number for a known reference date', () => {
    // 2026-04-29 → ISO week 18 of 2026
    expect(isoWeekKey(new Date('2026-04-29T12:00:00Z'))).toBe('2026-W18');
  });

  it('rolls over correctly at year boundaries', () => {
    // 2026-01-01 (Thursday) is in ISO week 1 of 2026
    expect(isoWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    // 2025-12-29 (Monday) is in ISO week 1 of 2026
    expect(isoWeekKey(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
  });

  it('is deterministic for the same input', () => {
    const ref = new Date('2026-07-15T08:30:00Z');
    expect(isoWeekKey(ref)).toBe(isoWeekKey(ref));
  });
});

describe('tryAcquireEmailLock', () => {
  it('returns true when insert succeeds (lock acquired)', async () => {
    const stub = makeSupabaseStub({ error: null });
    const ok = await tryAcquireEmailLock(
      stub.client,
      'email-factures-retard',
      '2026-W18',
    );
    expect(ok).toBe(true);
    expect(stub.from).toHaveBeenCalledWith('email_send_log');
    expect(stub.insert).toHaveBeenCalledWith({
      job: 'email-factures-retard',
      periode_key: '2026-W18',
      metadata: null,
    });
  });

  it('returns false on unique violation 23505 (already sent for that period)', async () => {
    const stub = makeSupabaseStub({ error: { code: '23505' } });
    const ok = await tryAcquireEmailLock(
      stub.client,
      'email-factures-retard',
      '2026-W18',
    );
    expect(ok).toBe(false);
  });

  it('fails open on unrelated DB errors (returns true so the email still ships)', async () => {
    const stub = makeSupabaseStub({ error: { code: '42P01' } }); // table missing
    const ok = await tryAcquireEmailLock(
      stub.client,
      'email-factures-retard',
      '2026-W18',
    );
    expect(ok).toBe(true);
  });

  it('forwards metadata when provided', async () => {
    const stub = makeSupabaseStub({ error: null });
    await tryAcquireEmailLock(stub.client, 'job-x', 'k1', { foo: 'bar' });
    expect(stub.insert).toHaveBeenCalledWith({
      job: 'job-x',
      periode_key: 'k1',
      metadata: { foo: 'bar' },
    });
  });
});
