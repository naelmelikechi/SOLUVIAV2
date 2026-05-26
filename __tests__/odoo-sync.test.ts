import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour lib/odoo/sync.ts (Sprint 9).
 *
 * Couvre:
 *  - Push facture success -> log 'success' + odoo_id ecrit sur la facture.
 *  - Push facture KO (erreur API) -> log 'error', facture pas marquee comme synced.
 *  - Pull paiements -> upsert paiement par odoo_id, marque facture 'payee' si totalPaid >= ttc.
 *  - Statut global pull = 'partial' quand certains paiements OK + certains KO.
 *  - Checkpoint `since` du pull lit le dernier log 'success' OU 'partial'
 *    (n'inclut PAS 'error' qui doit etre retry).
 *  - OAuth/connexion Odoo en panne (ping echoue / pullPayments throw) :
 *    sync se termine proprement, log 'error', pas d'exception remontee.
 *  - Idempotence push : la query filtre `.is('odoo_id', null)` => deja-pushed
 *    factures ne sont pas re-pushees.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/utils/audit', () => ({
  logAudit: vi.fn(),
}));

// --- Odoo client mock --------------------------------------------------------
const odooMock = {
  ping: vi.fn(),
  pushInvoice: vi.fn(),
  pushCreditNote: vi.fn(),
  pullPayments: vi.fn(),
  pullCancellations: vi.fn(),
  registerPayment: vi.fn(),
  attachInvoicePdf: vi.fn(async () => ({ attachment_id: null, skipped: true })),
  pushAnalyticLineForMove: vi.fn(async () => ({
    analytic_line_odoo_id: null,
    skipped: true,
    reason: 'mocked',
  })),
};

vi.mock('@/lib/odoo/client', () => ({
  createOdooClient: () => odooMock,
}));

// Stub l'attache PDF : depend de @react-pdf/renderer + server-only qui ne sont
// pas chargeables sous vitest (node). On testera l'idempotence du push, pas
// le rendu PDF (best-effort, deja log + non bloquant).
vi.mock('@/lib/odoo/attach-pdf', () => ({
  pushFacturePdfToOdoo: vi.fn(async () => ({ ok: true, skipped: true })),
}));

// --- Supabase mock chainable -------------------------------------------------

interface RecordedOp {
  table: string;
  op: 'select' | 'update' | 'delete' | 'insert' | 'upsert';
  filters: Array<{ kind: string; col?: string; val?: unknown; vals?: unknown }>;
  payload?: unknown;
  selectCols?: string;
}

interface FromHandler {
  // selectResult invoked when a select is awaited (then) OR maybeSingle / single
  selectResult?: (op: RecordedOp) => Promise<{ data: unknown; error: unknown }>;
  maybeSingleResult?: (
    op: RecordedOp,
  ) => Promise<{ data: unknown; error: unknown }>;
  countResult?: (
    op: RecordedOp,
  ) => Promise<{ count: number | null; error: unknown }>;
  updateResult?: (op: RecordedOp) => Promise<{ error: unknown }>;
  insertResult?: (op: RecordedOp) => Promise<{ error: unknown }>;
  upsertResult?: (op: RecordedOp) => Promise<{ error: unknown }>;
  deleteResult?: (op: RecordedOp) => Promise<{ error: unknown }>;
}

function buildSupabase(handlers: Record<string, FromHandler>) {
  const ops: RecordedOp[] = [];

  function chainForSelect(op: RecordedOp, h: FromHandler) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ kind: 'eq', col, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        op.filters.push({ kind: 'in', col, vals });
        return chain;
      },
      is(col: string, val: unknown) {
        op.filters.push({ kind: 'is', col, val });
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        if (h.maybeSingleResult) return h.maybeSingleResult(op);
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (h.maybeSingleResult) return h.maybeSingleResult(op);
        return Promise.resolve({ data: null, error: null });
      },
      then(
        onF: (v: { data: unknown; error: unknown; count?: number }) => unknown,
      ) {
        if (op.selectCols && op.selectCols.includes('count')) {
          // not used; we use a separate option flag (head/count) below
        }
        if (h.countResult) {
          return h.countResult(op).then((r) =>
            onF({
              data: null,
              error: r.error,
              count: r.count ?? undefined,
            }),
          );
        }
        if (h.selectResult) return h.selectResult(op).then(onF);
        return Promise.resolve({ data: [], error: null }).then(onF);
      },
    };
    return chain;
  }

  function chainForUpdate(op: RecordedOp, h: FromHandler) {
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ kind: 'eq', col, val });
        return chain;
      },
      then(onF: (v: { error: unknown }) => unknown) {
        if (h.updateResult) return h.updateResult(op).then(onF);
        return Promise.resolve({ error: null }).then(onF);
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      const h: FromHandler = handlers[table] ?? {};
      return {
        select(cols?: string, opts?: { count?: string; head?: boolean }) {
          const op: RecordedOp = {
            table,
            op: 'select',
            filters: [],
            selectCols: cols,
            payload: opts,
          };
          ops.push(op);
          return chainForSelect(op, h);
        },
        update(payload: unknown) {
          const op: RecordedOp = {
            table,
            op: 'update',
            filters: [],
            payload,
          };
          ops.push(op);
          return chainForUpdate(op, h);
        },
        delete() {
          const op: RecordedOp = { table, op: 'delete', filters: [] };
          ops.push(op);
          return chainForUpdate(op, h);
        },
        insert(payload: unknown) {
          const op: RecordedOp = {
            table,
            op: 'insert',
            filters: [],
            payload,
          };
          ops.push(op);
          if (h.insertResult) return h.insertResult(op);
          return Promise.resolve({ error: null });
        },
        upsert(payload: unknown, _opts?: { onConflict?: string }) {
          const op: RecordedOp = {
            table,
            op: 'upsert',
            filters: [],
            payload,
          };
          ops.push(op);
          if (h.upsertResult) return h.upsertResult(op);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, ops };
}

// Helpers --------------------------------------------------------------------

const FACTURE_ROW = {
  id: 'fac-1',
  ref: 'FAC-2026-0001',
  date_emission: '2026-04-01',
  date_echeance: '2026-05-01',
  est_avoir: false,
  montant_ht: 1000,
  montant_ttc: 1200,
  taux_tva: 20,
  client: {
    siret: '12345678900012',
    raison_sociale: 'Acme SAS',
    tva_intracommunautaire: 'FR12345678900',
    is_demo: false,
  },
  lignes: [{ description: 'Formation', montant_ht: 1000 }],
};

beforeEach(() => {
  odooMock.ping.mockReset();
  odooMock.pushInvoice.mockReset();
  odooMock.pushCreditNote.mockReset();
  odooMock.pullPayments.mockReset();
  odooMock.pullCancellations.mockReset();
  // Defaults so each test only overrides what it needs.
  odooMock.pullPayments.mockResolvedValue([]);
  odooMock.pullCancellations.mockResolvedValue([]);
});

// --- Tests -------------------------------------------------------------------

describe('syncOdoo - push factures', () => {
  it('push facture status emise -> appelle pushInvoice + log success + ecrit odoo_id', async () => {
    odooMock.pushInvoice.mockResolvedValue({ odoo_id: '777' });

    let factureFetchCount = 0;
    let avoirFetchCount = 0;
    const { client, ops } = buildSupabase({
      factures: {
        // Le sync fait deux selects sur factures: un pour pushFactures
        // (est_avoir=false) et un pour pushAvoirs (est_avoir=true). On
        // distingue par l'index d'appel.
        selectResult: async (op) => {
          const isFactureFetch = op.filters.some(
            (f) => f.kind === 'eq' && f.col === 'est_avoir' && f.val === false,
          );
          const isAvoirFetch = op.filters.some(
            (f) => f.kind === 'eq' && f.col === 'est_avoir' && f.val === true,
          );
          if (isFactureFetch) {
            factureFetchCount++;
            return { data: [FACTURE_ROW], error: null };
          }
          if (isAvoirFetch) {
            avoirFetchCount++;
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        // Le pull paiements fait un find facture by odoo_id, retourne null OK.
        maybeSingleResult: async () => ({ data: null, error: null }),
        updateResult: async () => ({ error: null }),
      },
      odoo_sync_logs: {
        // pull "since" lookup
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(factureFetchCount).toBe(1);
    expect(avoirFetchCount).toBe(1);
    expect(odooMock.pushInvoice).toHaveBeenCalledTimes(1);
    expect(result.pushed).toBe(1);
    expect(result.errors).toEqual([]);

    // Update factures.odoo_id called
    const update = ops.find(
      (o) =>
        o.op === 'update' &&
        o.table === 'factures' &&
        (o.payload as { odoo_id?: string }).odoo_id === '777',
    );
    expect(update).toBeDefined();

    // Log push success inserted
    const successLog = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string; statut?: string }).direction ===
          'push' &&
        (o.payload as { statut?: string }).statut === 'success',
    );
    expect(successLog).toBeDefined();
  });

  it('push facture, erreur API Odoo -> log error, odoo_id non ecrit, error remontee', async () => {
    odooMock.pushInvoice.mockRejectedValue(
      new Error('Odoo 500: internal server error'),
    );

    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) => {
          const isFactureFetch = op.filters.some(
            (f) => f.kind === 'eq' && f.col === 'est_avoir' && f.val === false,
          );
          return isFactureFetch
            ? { data: [FACTURE_ROW], error: null }
            : { data: [], error: null };
        },
        maybeSingleResult: async () => ({ data: null, error: null }),
        updateResult: async () => ({ error: null }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(result.pushed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Push facture FAC-2026-0001/);

    // Aucun update odoo_id sur la facture (donc retry possible au prochain run)
    const updates = ops.filter(
      (o) => o.op === 'update' && o.table === 'factures',
    );
    expect(updates).toHaveLength(0);

    // Log push error inserted
    const errorLog = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string; statut?: string }).direction ===
          'push' &&
        (o.payload as { statut?: string }).statut === 'error',
    );
    expect(errorLog).toBeDefined();
  });

  it('idempotence push : query filtre .is(odoo_id, null) => factures deja pushees ignorees', async () => {
    const { client, ops } = buildSupabase({
      factures: {
        // Retourne 0 facture (toutes ont deja un odoo_id). On verifie le filtre.
        selectResult: async () => ({ data: [], error: null }),
        maybeSingleResult: async () => ({ data: null, error: null }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(result.pushed).toBe(0);
    expect(odooMock.pushInvoice).not.toHaveBeenCalled();

    // Verifie qu'au moins un select factures a un filtre .is(odoo_id, null)
    const factureSelects = ops.filter(
      (o) => o.op === 'select' && o.table === 'factures',
    );
    expect(factureSelects.length).toBeGreaterThan(0);
    const hasNullFilter = factureSelects.some((s) =>
      s.filters.some(
        (f) => f.kind === 'is' && f.col === 'odoo_id' && f.val === null,
      ),
    );
    expect(hasNullFilter).toBe(true);
  });
});

describe('syncOdoo - pull paiements', () => {
  it('applique paiement Odoo a la facture matchee par odoo_id, marque payee si total >= ttc', async () => {
    odooMock.pullPayments.mockResolvedValue([
      {
        odoo_id: '999-42',
        invoice_odoo_id: '42',
        amount: 1200,
        date: '2026-04-15',
      },
    ]);

    let totalPaidCallCount = 0;
    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) => {
          // Le push fetch a un filtre est_avoir : on retourne []
          if (
            op.filters.some((f) => f.kind === 'eq' && f.col === 'est_avoir')
          ) {
            return { data: [], error: null };
          }
          // Le pull paiements fait un select 'montant' filtered by facture_id
          // qui est awaite directement (then) sans single().
          if (
            op.selectCols === 'montant' &&
            op.filters.some((f) => f.col === 'facture_id')
          ) {
            // unreachable: 'paiements' table not 'factures'
          }
          return { data: [], error: null };
        },
        maybeSingleResult: async (op) => {
          // Find by odoo_id = '42'
          const m = op.filters.find(
            (f) => f.kind === 'eq' && f.col === 'odoo_id',
          );
          if (m && m.val === '42') {
            return {
              data: { id: 'fac-local-1', montant_ttc: 1200 },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        updateResult: async () => ({ error: null }),
      },
      paiements: {
        upsertResult: async () => ({ error: null }),
        // select('montant').eq('facture_id', ...) awaited directly
        selectResult: async () => {
          totalPaidCallCount++;
          return { data: [{ montant: 1200 }], error: null };
        },
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(result.pulled).toBe(1);
    expect(totalPaidCallCount).toBe(1);

    // Upsert paiement avec onConflict odoo_id (idempotent cote pull)
    const upsert = ops.find(
      (o) => o.op === 'upsert' && o.table === 'paiements',
    );
    expect(upsert).toBeDefined();
    expect(
      (upsert!.payload as { odoo_id?: string; facture_id?: string }).odoo_id,
    ).toBe('999-42');

    // Statut payee mis a jour
    const statutUpdate = ops.find(
      (o) =>
        o.op === 'update' &&
        o.table === 'factures' &&
        (o.payload as { statut?: string }).statut === 'payee',
    );
    expect(statutUpdate).toBeDefined();

    // Log pull success inserte (puisque pas d'erreur)
    const log = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement',
    );
    expect(log).toBeDefined();
    expect((log!.payload as { statut?: string }).statut).toBe('success');
  });

  it("statut 'partial' quand au moins 1 paiement OK + au moins 1 erreur", async () => {
    odooMock.pullPayments.mockResolvedValue([
      {
        odoo_id: 'p-OK',
        invoice_odoo_id: 'fac-ok',
        amount: 500,
        date: '2026-04-15',
      },
      {
        odoo_id: 'p-FAIL',
        invoice_odoo_id: 'fac-fail',
        amount: 700,
        date: '2026-04-16',
      },
    ]);

    let upsertCalls = 0;
    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) => {
          if (
            op.filters.some((f) => f.kind === 'eq' && f.col === 'est_avoir')
          ) {
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        maybeSingleResult: async (op) => {
          const m = op.filters.find(
            (f) => f.kind === 'eq' && f.col === 'odoo_id',
          );
          if (m?.val === 'fac-ok')
            return {
              data: { id: 'fac-ok-id', montant_ttc: 1000 },
              error: null,
            };
          if (m?.val === 'fac-fail')
            return {
              data: { id: 'fac-fail-id', montant_ttc: 1000 },
              error: null,
            };
          return { data: null, error: null };
        },
        updateResult: async () => ({ error: null }),
      },
      paiements: {
        upsertResult: async (op) => {
          upsertCalls++;
          const odooId = (op.payload as { odoo_id?: string }).odoo_id;
          if (odooId === 'p-FAIL') {
            return { error: { message: 'unique violation random' } };
          }
          return { error: null };
        },
        selectResult: async () => ({
          data: [{ montant: 500 }],
          error: null,
        }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(upsertCalls).toBe(2);
    expect(result.pulled).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);

    const log = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement',
    );
    expect(log).toBeDefined();
    expect((log!.payload as { statut?: string }).statut).toBe('partial');
  });

  it("checkpoint 'since' : lit dernier log 'success' OU 'partial', filtre 'error' exclu", async () => {
    odooMock.pullPayments.mockResolvedValue([]);

    let observedSinceFilter: { col?: string; vals?: unknown } | undefined;
    const { client } = buildSupabase({
      factures: {
        selectResult: async () => ({ data: [], error: null }),
        maybeSingleResult: async () => ({ data: null, error: null }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async (op) => {
          // Capture le filtre `in('statut', [...])` du select 'since'
          const inFilter = op.filters.find(
            (f) => f.kind === 'in' && f.col === 'statut',
          );
          if (inFilter) {
            observedSinceFilter = { col: inFilter.col, vals: inFilter.vals };
          }
          return {
            data: { created_at: '2026-04-20T10:00:00Z' },
            error: null,
          };
        },
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    await syncOdoo(client as never);

    expect(observedSinceFilter).toBeDefined();
    const vals = observedSinceFilter!.vals as string[];
    expect(vals).toContain('success');
    expect(vals).toContain('partial');
    expect(vals).not.toContain('error');
    expect(vals).not.toContain('retry');

    // Le `since` capture est passe a Odoo (preuve qu'il n'a pas ete reset
    // a l'epoch alors qu'un log valide existait)
    expect(odooMock.pullPayments).toHaveBeenCalledWith('2026-04-20T10:00:00Z');
  });

  it("Odoo en panne (pullPayments throw) : sync se termine, log 'error', pas d'exception", async () => {
    odooMock.pullPayments.mockRejectedValue(
      new Error('Odoo unreachable: ECONNREFUSED'),
    );

    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async () => ({ data: [], error: null }),
        maybeSingleResult: async () => ({ data: null, error: null }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: {
        selectResult: async () => ({ data: [], error: null }),
      },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');

    // Doit resoudre proprement (pas de throw)
    const result = await syncOdoo(client as never);

    expect(result.pulled).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toMatch(/pullPayments/);

    // Log 'error' inscrit pour le pull paiement
    const errorLog = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement' &&
        (o.payload as { statut?: string }).statut === 'error',
    );
    expect(errorLog).toBeDefined();
  });
});
