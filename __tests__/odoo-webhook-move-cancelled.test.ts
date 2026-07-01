// Env requis AVANT tout import chargeant @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.ODOO_WEBHOOK_SECRET = 'shh-secret';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Webhook move-cancelled (Option B, chantier 4) :
 *  - webhook_writes_per_move_log : POST valide -> notif + log cancellation par
 *    move (entity_type='cancellation', entity_id=facture.id, source='webhook').
 *  - webhook_then_cron_single_notif : si un log par move existe deja (etat
 *    post-webhook), le webhook lui-meme skippe la re-notif (garde defensive).
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

interface RecordedOp {
  table: string;
  op: 'select' | 'insert';
  filters: Array<{ kind: string; col?: string; val?: unknown }>;
  payload?: unknown;
  countHead?: boolean;
}

interface TableRules {
  countResult?: () => { count: number | null; error: unknown };
  selectResult?: () => { data: unknown; error: unknown };
  insertResult?: () => { error: unknown };
}

interface AdminHarness {
  client: { from: (table: string) => unknown };
  ops: RecordedOp[];
}

function buildAdmin(rules: Record<string, TableRules>): AdminHarness {
  const ops: RecordedOp[] = [];
  function selectChain(op: RecordedOp, rule?: TableRules) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ kind: 'eq', col, val });
        return chain;
      },
      in(col: string, val: unknown) {
        op.filters.push({ kind: 'in', col, val });
        return chain;
      },
      maybeSingle() {
        const r = rule?.selectResult
          ? rule.selectResult()
          : { data: null, error: null };
        return Promise.resolve(r);
      },
      then(
        onF: (v: { data: unknown; error: unknown; count?: number }) => unknown,
      ) {
        if (op.countHead && rule?.countResult) {
          const r = rule.countResult();
          return Promise.resolve(
            onF({ data: null, error: r.error, count: r.count ?? undefined }),
          ).then((v) => v);
        }
        const r = rule?.selectResult
          ? rule.selectResult()
          : { data: [], error: null };
        return Promise.resolve(onF(r));
      },
    };
    return chain;
  }
  const client = {
    from(table: string) {
      const rule = rules[table];
      return {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          const op: RecordedOp = {
            table,
            op: 'select',
            filters: [],
            countHead: Boolean(opts?.head && opts?.count),
          };
          ops.push(op);
          return selectChain(op, rule);
        },
        insert(payload: unknown) {
          const op: RecordedOp = { table, op: 'insert', filters: [], payload };
          ops.push(op);
          return Promise.resolve(
            rule?.insertResult ? rule.insertResult() : { error: null },
          );
        },
      };
    },
  };
  return { client, ops };
}

let adminBuild: AdminHarness;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminBuild.client,
}));

const FACTURE = {
  id: 'fac-1',
  ref: 'FAC-HEO-0001',
  est_avoir: false,
};

function makeRequest(body: object) {
  return new Request('https://app.test/api/webhooks/odoo/move-cancelled', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-token': 'shh-secret',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/odoo/move-cancelled — dedup Option B', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FINANCES_WEBHOOK_URL;
    delete process.env.FINANCES_WEBHOOK_TOKEN;
  });

  it('webhook_writes_per_move_log : notif + log cancellation par move', async () => {
    adminBuild = buildAdmin({
      factures: {
        selectResult: () => ({ data: FACTURE, error: null }),
        countResult: () => ({ count: 0, error: null }), // pas d'avoir existant
      },
      odoo_sync_logs: {
        countResult: () => ({ count: 0, error: null }), // pas encore traite
      },
      users: {
        selectResult: () => ({
          data: [{ id: 'admin-1' }, { id: 'admin-2' }],
          error: null,
        }),
      },
    });

    const { POST } =
      await import('@/app/api/webhooks/odoo/move-cancelled/route');
    const res = await POST(
      makeRequest({ odoo_id: 134, write_date: '2026-05-22T10:00:00Z' }),
    );
    expect(res.status).toBe(200);

    const notifInsert = adminBuild.ops.find(
      (o) => o.op === 'insert' && o.table === 'notifications',
    );
    expect(notifInsert).toBeDefined();

    const logInsert = adminBuild.ops.find(
      (o) => o.op === 'insert' && o.table === 'odoo_sync_logs',
    );
    expect(logInsert).toBeDefined();
    // Forme du payload connue (construit par le handler).
    const payload = logInsert!.payload as {
      entity_type?: string;
      entity_id?: string;
      payload?: { source?: string };
    };
    expect(payload.entity_type).toBe('cancellation');
    expect(payload.entity_id).toBe('fac-1');
    expect(payload.payload?.source).toBe('webhook');
  });

  it('webhook_then_cron_single_notif : log par move deja present -> skip, aucune notif', async () => {
    adminBuild = buildAdmin({
      factures: {
        selectResult: () => ({ data: FACTURE, error: null }),
        countResult: () => ({ count: 0, error: null }),
      },
      odoo_sync_logs: {
        countResult: () => ({ count: 1, error: null }), // deja notifie
      },
      users: {
        selectResult: () => ({ data: [{ id: 'admin-1' }], error: null }),
      },
    });

    const { POST } =
      await import('@/app/api/webhooks/odoo/move-cancelled/route');
    const res = await POST(
      makeRequest({ odoo_id: 134, write_date: '2026-05-22T10:00:00Z' }),
    );
    expect(res.status).toBe(200);

    // Ni notif ni nouveau log (deja traite).
    expect(
      adminBuild.ops.find(
        (o) => o.op === 'insert' && o.table === 'notifications',
      ),
    ).toBeUndefined();
    expect(
      adminBuild.ops.find(
        (o) => o.op === 'insert' && o.table === 'odoo_sync_logs',
      ),
    ).toBeUndefined();
  });

  it('notif_insert_echoue : ancre log statut=error (le cron re-notifiera)', async () => {
    adminBuild = buildAdmin({
      factures: {
        selectResult: () => ({ data: FACTURE, error: null }),
        countResult: () => ({ count: 0, error: null }),
      },
      odoo_sync_logs: {
        countResult: () => ({ count: 0, error: null }),
      },
      users: {
        selectResult: () => ({ data: [{ id: 'admin-1' }], error: null }),
      },
      notifications: {
        insertResult: () => ({ error: { message: 'insert KO' } }),
      },
    });

    // Exception ts-no-dynamic-import : frontiere de chargement de module (le
    // handler doit etre importe APRES l'enregistrement des vi.mock).
    const { POST } =
      await import('@/app/api/webhooks/odoo/move-cancelled/route');
    const res = await POST(
      makeRequest({ odoo_id: 134, write_date: '2026-05-22T10:00:00Z' }),
    );
    expect(res.status).toBe(200);

    // La notif a bien ete tentee...
    expect(
      adminBuild.ops.find(
        (o) => o.op === 'insert' && o.table === 'notifications',
      ),
    ).toBeDefined();
    // ...mais comme l'insert a echoue, l'ancre est statut='error' -> le cron
    // (qui ne skippe que success/partial) re-notifiera dans l'heure.
    const logInsert = adminBuild.ops.find(
      (o) => o.op === 'insert' && o.table === 'odoo_sync_logs',
    );
    expect(logInsert).toBeDefined();
    const p = logInsert!.payload;
    const statut =
      p && typeof p === 'object' && 'statut' in p ? p.statut : undefined;
    expect(statut).toBe('error');
  });
});
