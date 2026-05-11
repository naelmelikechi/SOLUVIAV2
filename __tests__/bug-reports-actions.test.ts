process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/actions/bug-reports.ts.
 *
 * Couvre :
 * - updateBugReportAction : validation Zod, guard admin, set resolved_at/by
 *   selon status (resolu|wontfix vs nouveau|en_cours)
 * - resendBugReportEmailAction : validation UUID, guard admin, delegation
 *   a sendBugReportEmail
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/email/bug-report', () => ({
  sendBugReportEmail: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth/guards';
import { sendBugReportEmail } from '@/lib/email/bug-report';

const VALID_UUID = '11111111-1111-4111-a111-111111111111';

function buildSupabase(
  updateResult: { error?: { message: string } | null } = {},
) {
  const calls: Array<{
    table: string;
    values: Record<string, unknown>;
    filter: { col: string; val: unknown };
  }> = [];
  const client = {
    from(table: string) {
      let pending: { values: Record<string, unknown> } | null = null;
      return {
        update(values: Record<string, unknown>) {
          pending = { values };
          return {
            eq(col: string, val: unknown) {
              calls.push({
                table,
                values: pending!.values,
                filter: { col, val },
              });
              return Promise.resolve({ error: updateResult.error ?? null });
            },
          };
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
// updateBugReportAction
// ---------------------------------------------------------------------------

describe('updateBugReportAction', () => {
  it('rejette les inputs invalides (ID non-UUID)', async () => {
    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: 'not-a-uuid',
      status: 'nouveau',
      resolutionNotes: null,
    });
    expect(res).toEqual({ success: false, error: 'Donnees invalides' });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it('rejette les inputs invalides (status hors enum)', async () => {
    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: VALID_UUID,
      // @ts-expect-error - test invalid status
      status: 'inexistant',
      resolutionNotes: null,
    });
    expect(res.success).toBe(false);
  });

  it('rejette les inputs invalides (notes > 2000 chars)', async () => {
    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: VALID_UUID,
      status: 'resolu',
      resolutionNotes: 'x'.repeat(2001),
    });
    expect(res.success).toBe(false);
  });

  it('non-admin -> 403 (relaye auth.error)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: 'Accès admin requis',
    });
    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: VALID_UUID,
      status: 'nouveau',
      resolutionNotes: null,
    });
    expect(res).toEqual({ success: false, error: 'Accès admin requis' });
  });

  it('status resolu -> set resolved_at + resolved_by', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
      role: 'admin',
    });

    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: VALID_UUID,
      status: 'resolu',
      resolutionNotes: 'Fix dans commit abc123',
    });

    expect(res).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.table).toBe('bug_reports');
    expect(c.filter).toEqual({ col: 'id', val: VALID_UUID });
    expect(c.values.status).toBe('resolu');
    expect(c.values.resolution_notes).toBe('Fix dans commit abc123');
    expect(c.values.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.values.resolved_by).toBe('user-1');
  });

  it('status wontfix -> set resolved_at + resolved_by', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-2' } as any,
      role: 'admin',
    });

    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    await updateBugReportAction({
      id: VALID_UUID,
      status: 'wontfix',
      resolutionNotes: null,
    });

    const c = calls[0]!;
    expect(c.values.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.values.resolved_by).toBe('user-2');
  });

  it('status nouveau -> nullify resolved_at + resolved_by (rouverture)', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
      role: 'admin',
    });

    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    await updateBugReportAction({
      id: VALID_UUID,
      status: 'nouveau',
      resolutionNotes: null,
    });

    const c = calls[0]!;
    expect(c.values.resolved_at).toBeNull();
    expect(c.values.resolved_by).toBeNull();
  });

  it('status en_cours -> resolved_at reste null', async () => {
    const { client, calls } = buildSupabase();
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
      role: 'admin',
    });

    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    await updateBugReportAction({
      id: VALID_UUID,
      status: 'en_cours',
      resolutionNotes: 'En cours d investigation',
    });

    const c = calls[0]!;
    expect(c.values.status).toBe('en_cours');
    expect(c.values.resolved_at).toBeNull();
    expect(c.values.resolved_by).toBeNull();
  });

  it('relaye l erreur supabase', async () => {
    const { client } = buildSupabase({ error: { message: 'RLS denied' } });
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: client as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
      role: 'admin',
    });

    const { updateBugReportAction } = await import('@/lib/actions/bug-reports');
    const res = await updateBugReportAction({
      id: VALID_UUID,
      status: 'resolu',
      resolutionNotes: null,
    });
    expect(res).toEqual({ success: false, error: 'RLS denied' });
  });
});

// ---------------------------------------------------------------------------
// resendBugReportEmailAction
// ---------------------------------------------------------------------------

describe('resendBugReportEmailAction', () => {
  it('rejette les inputs invalides (UUID malforme)', async () => {
    const { resendBugReportEmailAction } =
      await import('@/lib/actions/bug-reports');
    const res = await resendBugReportEmailAction('not-a-uuid');
    expect(res).toEqual({ success: false, error: 'ID invalide' });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(sendBugReportEmail).not.toHaveBeenCalled();
  });

  it('non-admin -> 403', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: 'Accès admin requis',
    });
    const { resendBugReportEmailAction } =
      await import('@/lib/actions/bug-reports');
    const res = await resendBugReportEmailAction(VALID_UUID);
    expect(res).toEqual({ success: false, error: 'Accès admin requis' });
    expect(sendBugReportEmail).not.toHaveBeenCalled();
  });

  it('delegue a sendBugReportEmail si admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'user-1' } as any,
      role: 'admin',
    });
    vi.mocked(sendBugReportEmail).mockResolvedValue({ success: true });

    const { resendBugReportEmailAction } =
      await import('@/lib/actions/bug-reports');
    const res = await resendBugReportEmailAction(VALID_UUID);
    expect(res).toEqual({ success: true });
    expect(sendBugReportEmail).toHaveBeenCalledWith(VALID_UUID);
  });
});
