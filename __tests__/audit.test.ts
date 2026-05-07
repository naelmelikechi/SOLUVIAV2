// Set required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted lets the factories below reference these handles even though
// vi.mock is hoisted to the top of the file at compile time.
const mocks = vi.hoisted(() => {
  const afterCalls: Array<() => Promise<void> | void> = [];
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'u-fallback' } } });
  return { afterCalls, insert, from, getUser };
});

vi.mock('next/server', () => ({
  after: (cb: () => Promise<void> | void) => {
    mocks.afterCalls.push(cb);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mocks.from,
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logAudit } from '@/lib/utils/audit';

describe('logAudit (audit log helper)', () => {
  beforeEach(() => {
    mocks.afterCalls.length = 0;
    mocks.insert.mockClear();
    mocks.from.mockClear();
    mocks.getUser.mockClear();
  });

  it('defere l INSERT via after() au lieu de l executer immediatement', async () => {
    logAudit('action_x', 'entity', 'id-1', { foo: 'bar' }, 'user-1');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.afterCalls).toHaveLength(1);

    // Drain manuellement le callback comme Vercel le fait apres la response.
    await mocks.afterCalls[0]!();

    expect(mocks.from).toHaveBeenCalledWith('audit_logs');
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      action: 'action_x',
      entity_type: 'entity',
      entity_id: 'id-1',
      details: { foo: 'bar' },
    });
  });

  it('si userId omis, resout via auth.getUser()', async () => {
    logAudit('action_y', 'entity', 'id-2');
    await mocks.afterCalls[0]!();

    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-fallback', action: 'action_y' }),
    );
  });

  it('renvoie void synchroniquement (fire-safe : pas besoin d await)', () => {
    const ret = logAudit('action_z', 'entity', 'id-3', undefined, 'user-3');
    expect(ret).toBeUndefined();
  });

  it('aucun callsite dans lib/actions ne wrap logAudit avec await ou after()', async () => {
    // Ceinture+bretelles : la regle ESLint l interdit, mais on garde un test
    // d invariant pour eviter une regression silencieuse si la regle saute.
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ROOT = new URL('../lib/actions/', import.meta.url).pathname;

    function listTs(dir: string): string[] {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...listTs(p));
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
      }
      return out;
    }

    const offenders: string[] = [];
    for (const file of listTs(ROOT)) {
      const src = readFileSync(file, 'utf8');
      if (/\bawait\s+logAudit\s*\(/.test(src))
        offenders.push(`${file} (await logAudit)`);
      if (/\bafter\s*\(\s*\(\s*\)\s*=>\s*logAudit\s*\(/.test(src)) {
        offenders.push(`${file} (after(() => logAudit))`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
