process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  notifyAuditAnomalies,
  formatAnomaliesMessage,
  type AuditAnomaly,
} from '@/lib/eduvia/audit-notify';

// ---------------------------------------------------------------------------
// Mock Supabase minimal : users (select), notifications (select + insert)
// ---------------------------------------------------------------------------

function buildSupabase(opts: {
  admins?: Array<{ id: string }>;
  adminsError?: { message: string } | null;
  unread?: Array<{ user_id: string }>;
  insertError?: { message: string } | null;
}) {
  const inserted: unknown[] = [];

  function chain(result: { data: unknown; error: unknown }) {
    const c: Record<string, unknown> = {
      in: () => c,
      eq: () => c,
      is: () => c,
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return c;
  }

  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () =>
            chain({
              data: opts.adminsError ? null : (opts.admins ?? []),
              error: opts.adminsError ?? null,
            }),
        };
      }
      if (table === 'notifications') {
        return {
          select: () => chain({ data: opts.unread ?? [], error: null }),
          insert: (payload: unknown) => {
            inserted.push(payload);
            return Promise.resolve({ error: opts.insertError ?? null });
          },
        };
      }
      throw new Error(`table inattendue: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, inserted };
}

const ANOMALIES: AuditAnomaly[] = [
  {
    type: 'contract_state_actif_date_fin_passee',
    count: 12,
    sample: ['CTR-001', 'CTR-002'],
  },
  { type: 'npec_zero_actif', count: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('formatAnomaliesMessage', () => {
  it('liste chaque anomalie avec compteur, libelle FR et echantillon', () => {
    const msg = formatAnomaliesMessage(ANOMALIES);
    expect(msg).toContain('12 contrat(s) actif(s) avec date de fin passée');
    expect(msg).toContain('(ex: CTR-001, CTR-002)');
    expect(msg).toContain('3 contrat(s) actif(s) avec NPEC nul ou manquant');
  });
});

describe('notifyAuditAnomalies', () => {
  it('notifie chaque admin actif (1 batch insert, type erreur_sync)', async () => {
    const { client, inserted } = buildSupabase({
      admins: [{ id: 'admin-1' }, { id: 'admin-2' }],
    });

    const res = await notifyAuditAnomalies(client, ANOMALIES);

    expect(res.notified).toBe(2);
    expect(inserted).toHaveLength(1);
    const rows = inserted[0] as Array<{
      type: string;
      user_id: string;
      titre: string;
      message: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id).sort()).toEqual(['admin-1', 'admin-2']);
    expect(rows[0]!.type).toBe('erreur_sync');
    expect(rows[0]!.titre).toMatch(/Audit Eduvia/);
    expect(rows[0]!.message).toContain('12 contrat(s)');
  });

  it('dedup : un admin avec la meme notification non lue n est pas re-notifie', async () => {
    const { client, inserted } = buildSupabase({
      admins: [{ id: 'admin-1' }, { id: 'admin-2' }],
      unread: [{ user_id: 'admin-1' }],
    });

    const res = await notifyAuditAnomalies(client, ANOMALIES);

    expect(res.notified).toBe(1);
    const rows = inserted[0] as Array<{ user_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe('admin-2');
  });

  it('aucune anomalie -> aucune requete, notified=0', async () => {
    const { client, inserted } = buildSupabase({
      admins: [{ id: 'admin-1' }],
    });

    const res = await notifyAuditAnomalies(client, []);

    expect(res.notified).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it('best-effort : erreur lecture admins -> notified=0 sans throw', async () => {
    const { client, inserted } = buildSupabase({
      adminsError: { message: 'rls denied' },
    });

    await expect(notifyAuditAnomalies(client, ANOMALIES)).resolves.toEqual({
      notified: 0,
    });
    expect(inserted).toHaveLength(0);
  });

  it('best-effort : erreur insert -> notified=0 sans throw', async () => {
    const { client } = buildSupabase({
      admins: [{ id: 'admin-1' }],
      insertError: { message: 'enum invalide' },
    });

    await expect(notifyAuditAnomalies(client, ANOMALIES)).resolves.toEqual({
      notified: 0,
    });
  });
});
