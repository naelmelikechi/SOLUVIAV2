import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv('BRAIN_GITHUB_REPO', 'me/vault');
  vi.stubEnv('BRAIN_GITHUB_TOKEN', 'tok');
  vi.stubEnv('BRAIN_GITHUB_BRANCH', 'main');
});

describe('putNote', () => {
  it('no-op si non configuré', async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const { putNote } = await import('@/lib/brain/github');
    const res = await putNote('fiches/x.md', 'body', 'msg');
    expect(res).toEqual({ ok: false, skipped: true });
  });

  it('crée le fichier (GET 404 → PUT sans sha)', async () => {
    vi.resetModules();
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        calls.push({
          url: u,
          method: init?.method ?? 'GET',
          body: init?.body as string,
        });
        if (!init?.method || init.method === 'GET')
          return new Response('', { status: 404 });
        return new Response(JSON.stringify({ content: {} }), { status: 201 });
      },
    ) as unknown as typeof fetch;
    const { putNote } = await import('@/lib/brain/github');
    const res = await putNote('fiches/x.md', 'body', 'msg');
    expect(res).toEqual({ ok: true });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).not.toContain('"sha"');
    expect(JSON.parse(put!.body as string).content).toBe(
      Buffer.from('body', 'utf8').toString('base64'),
    );
  });
});
