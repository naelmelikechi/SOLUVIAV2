import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'x'.repeat(32) },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { verifyCronAuth } from '@/lib/utils/cron-auth';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/test', { headers });
}

describe('verifyCronAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when bearer matches CRON_SECRET', () => {
    const result = verifyCronAuth(
      req({ authorization: `Bearer ${'x'.repeat(32)}` }),
    );
    expect(result).toBeNull();
  });

  it('returns 401 when bearer is wrong', async () => {
    const result = verifyCronAuth(
      req({ authorization: `Bearer ${'y'.repeat(32)}` }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 401 when authorization header is absent', () => {
    const result = verifyCronAuth(req());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 401 when token has different length (timing-safe path)', () => {
    const result = verifyCronAuth(req({ authorization: 'Bearer short' }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('rejects scheme other than Bearer', () => {
    const result = verifyCronAuth(
      req({ authorization: `Basic ${'x'.repeat(32)}` }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe('verifyCronAuth without CRON_SECRET configured', () => {
  it('returns 500 when secret is missing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({ env: { CRON_SECRET: undefined } }));
    vi.doMock('@/lib/utils/logger', () => ({
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));
    const mod = await import('@/lib/utils/cron-auth');
    const result = mod.verifyCronAuth(
      req({ authorization: 'Bearer whatever' }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
  });
});
