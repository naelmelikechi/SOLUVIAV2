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
  pullInvoicePayments: vi.fn(),
  pullCancellations: vi.fn(),
  registerPayment: vi.fn(),
  findUnreconciledIncomingBankLines: vi.fn(),
  attachInvoicePdf: vi.fn(async () => ({ attachment_id: null, skipped: true })),
  pushAnalyticLineForMove: vi.fn(async () => ({
    analytic_line_odoo_id: null,
    skipped: true,
    reason: 'mocked',
  })),
  ensureAutoReconcileModel: vi.fn(async () => ({
    model_odoo_id: null,
    action: 'skipped' as const,
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
      not(col: string, op2: string, val: unknown) {
        op.filters.push({ kind: 'not', col, val: `${op2}:${val}` });
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
  odooMock.pullInvoicePayments.mockReset();
  odooMock.pullCancellations.mockReset();
  odooMock.findUnreconciledIncomingBankLines.mockReset();
  // Defaults so each test only overrides what it needs.
  odooMock.pullInvoicePayments.mockResolvedValue([]);
  odooMock.pullCancellations.mockResolvedValue([]);
  odooMock.findUnreconciledIncomingBankLines.mockResolvedValue([]);
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
          // Le pull paiements selectionne aussi les factures (filtre `.not`
          // sur odoo_id) : on l'ignore ici (aucune facture suivie).
          const isPullFetch = op.filters.some(
            (f) => f.kind === 'not' && f.col === 'odoo_id',
          );
          if (isPullFetch) return { data: [], error: null };
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

describe('syncOdoo - pull paiements (facture-driven)', () => {
  // Le pull selectionne les factures emise/en_retard ayant un odoo_id via un
  // filtre `.not('odoo_id', 'is', null)`. On distingue ce select de celui du
  // push (qui filtre `.is('odoo_id', null)`) par la presence d'un filtre 'not'.
  const isPullSelect = (op: RecordedOp) =>
    op.table === 'factures' &&
    op.filters.some((f) => f.kind === 'not' && f.col === 'odoo_id');

  it('move Odoo payment_state=paid (reconcilie via releve, sans account.payment) -> upsert paiement + facture payee', async () => {
    // Cas reel FAC-HEO-0002 : aucun account.payment, mais le move est paye via
    // reconciliation directe d'une ligne bancaire.
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '134',
        payment_state: 'paid',
        amount_total: 34571.21,
        amount_residual: 0,
        payments: [
          { odoo_id: 'recon-1', amount: 34571.21, date: '2026-05-22' },
        ],
      },
    ]);

    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) =>
          isPullSelect(op)
            ? {
                data: [
                  {
                    id: 'fac-local-1',
                    ref: 'FAC-HEO-0001',
                    odoo_id: '134',
                    montant_ttc: 34571.21,
                    statut: 'en_retard',
                  },
                ],
                error: null,
              }
            : { data: [], error: null },
        updateResult: async () => ({ error: null }),
      },
      paiements: {
        upsertResult: async () => ({ error: null }),
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
    expect(odooMock.pullInvoicePayments).toHaveBeenCalledWith(['134']);

    const upsert = ops.find(
      (o) => o.op === 'upsert' && o.table === 'paiements',
    );
    expect(upsert).toBeDefined();
    expect((upsert!.payload as { odoo_id?: string }).odoo_id).toBe('recon-1');

    const statutUpdate = ops.find(
      (o) =>
        o.op === 'update' &&
        o.table === 'factures' &&
        (o.payload as { statut?: string }).statut === 'payee',
    );
    expect(statutUpdate).toBeDefined();

    const log = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement',
    );
    expect((log!.payload as { statut?: string }).statut).toBe('success');
  });

  it('paiement partiel (payment_state=partial) -> upsert paiement mais facture PAS marquee payee', async () => {
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '200',
        payment_state: 'partial',
        amount_total: 1000,
        amount_residual: 500,
        payments: [{ odoo_id: 'recon-9', amount: 500, date: '2026-05-20' }],
      },
    ]);

    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) =>
          isPullSelect(op)
            ? {
                data: [
                  {
                    id: 'fac-partial',
                    ref: 'FAC-X-0009',
                    odoo_id: '200',
                    montant_ttc: 1000,
                    statut: 'emise',
                  },
                ],
                error: null,
              }
            : { data: [], error: null },
        updateResult: async () => ({ error: null }),
      },
      paiements: { upsertResult: async () => ({ error: null }) },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: { selectResult: async () => ({ data: [], error: null }) },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(result.pulled).toBe(1);
    // Aucune mise a jour statut payee (la facture est partiellement payee).
    const payeeUpdate = ops.find(
      (o) =>
        o.op === 'update' &&
        o.table === 'factures' &&
        (o.payload as { statut?: string }).statut === 'payee',
    );
    expect(payeeUpdate).toBeUndefined();
  });

  it("statut 'partial' quand au moins 1 upsert OK + au moins 1 KO", async () => {
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '301',
        payment_state: 'paid',
        amount_total: 1000,
        amount_residual: 0,
        payments: [{ odoo_id: 'recon-OK', amount: 1000, date: '2026-05-15' }],
      },
      {
        invoice_odoo_id: '302',
        payment_state: 'paid',
        amount_total: 700,
        amount_residual: 0,
        payments: [{ odoo_id: 'recon-FAIL', amount: 700, date: '2026-05-16' }],
      },
    ]);

    let upsertCalls = 0;
    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) =>
          isPullSelect(op)
            ? {
                data: [
                  {
                    id: 'fac-ok-id',
                    ref: 'FAC-A',
                    odoo_id: '301',
                    montant_ttc: 1000,
                    statut: 'en_retard',
                  },
                  {
                    id: 'fac-fail-id',
                    ref: 'FAC-B',
                    odoo_id: '302',
                    montant_ttc: 700,
                    statut: 'en_retard',
                  },
                ],
                error: null,
              }
            : { data: [], error: null },
        updateResult: async () => ({ error: null }),
      },
      paiements: {
        upsertResult: async (op) => {
          upsertCalls++;
          const odooId = (op.payload as { odoo_id?: string }).odoo_id;
          if (odooId === 'recon-FAIL') {
            return { error: { message: 'unique violation random' } };
          }
          return { error: null };
        },
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: { selectResult: async () => ({ data: [], error: null }) },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(upsertCalls).toBe(2);
    expect(result.pulled).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);

    // La facture OK passe payee ; celle dont l'upsert a echoue ne bascule PAS
    // (sinon payee sans trace + sortie du set de retry).
    const payeeUpdates = ops.filter(
      (o) =>
        o.op === 'update' &&
        o.table === 'factures' &&
        (o.payload as { statut?: string }).statut === 'payee',
    );
    expect(payeeUpdates).toHaveLength(1);

    const log = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement',
    );
    expect((log!.payload as { statut?: string }).statut).toBe('partial');
  });

  it('aucune facture suivie -> success count 0, Odoo pas interroge', async () => {
    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async () => ({ data: [], error: null }),
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: { selectResult: async () => ({ data: [], error: null }) },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');
    const result = await syncOdoo(client as never);

    expect(result.pulled).toBe(0);
    expect(odooMock.pullInvoicePayments).not.toHaveBeenCalled();

    const log = ops.find(
      (o) =>
        o.op === 'insert' &&
        o.table === 'odoo_sync_logs' &&
        (o.payload as { direction?: string }).direction === 'pull' &&
        (o.payload as { entity_type?: string }).entity_type === 'paiement',
    );
    expect((log!.payload as { statut?: string }).statut).toBe('success');
  });

  it("Odoo en panne (pullInvoicePayments throw) : sync se termine, log 'error', pas d'exception", async () => {
    odooMock.pullInvoicePayments.mockRejectedValue(
      new Error('Odoo unreachable: ECONNREFUSED'),
    );

    const { client, ops } = buildSupabase({
      factures: {
        selectResult: async (op) =>
          isPullSelect(op)
            ? {
                data: [
                  {
                    id: 'fac-1',
                    ref: 'FAC-Z',
                    odoo_id: '999',
                    montant_ttc: 100,
                    statut: 'en_retard',
                  },
                ],
                error: null,
              }
            : { data: [], error: null },
      },
      odoo_sync_logs: {
        maybeSingleResult: async () => ({ data: null, error: null }),
        insertResult: async () => ({ error: null }),
      },
      users: { selectResult: async () => ({ data: [], error: null }) },
    });

    const { syncOdoo } = await import('@/lib/odoo/sync');

    // Doit resoudre proprement (pas de throw)
    const result = await syncOdoo(client as never);

    expect(result.pulled).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join(' ')).toMatch(/pullInvoicePayments/);

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

describe('syncOdoo - detection encaissement non lettre', () => {
  const isPullSelect = (op: RecordedOp) =>
    op.table === 'factures' &&
    op.filters.some((f) => f.kind === 'not' && f.col === 'odoo_id');

  const baseHandlers = (notifExisting: { lien: string }[] = []) => ({
    factures: {
      selectResult: async (op: RecordedOp) =>
        isPullSelect(op)
          ? {
              data: [
                {
                  id: 'fac-local-1',
                  ref: 'FAC-HEO-0001',
                  odoo_id: '134',
                  montant_ttc: 34571.21,
                  statut: 'en_retard',
                },
              ],
              error: null,
            }
          : { data: [], error: null },
    },
    paiements: { upsertResult: async () => ({ error: null }) },
    odoo_sync_logs: {
      maybeSingleResult: async () => ({ data: null, error: null }),
      insertResult: async () => ({ error: null }),
    },
    users: {
      selectResult: async () => ({
        data: [{ id: 'admin-1' }, { id: 'admin-2' }],
        error: null,
      }),
    },
    notifications: {
      selectResult: async () => ({ data: notifExisting, error: null }),
      insertResult: async () => ({ error: null }),
    },
  });

  it('facture non payee + ligne bancaire non lettree qui matche -> notifie les admins', async () => {
    // FAC-HEO-0001 : Odoo dit not_paid (argent en banque mais pas lettre).
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '134',
        payment_state: 'not_paid',
        amount_total: 34571.21,
        amount_residual: 34571.21,
        payments: [],
      },
    ]);
    // Ligne bancaire #140 : meme montant, ref reformattee par la banque.
    odooMock.findUnreconciledIncomingBankLines.mockResolvedValue([
      {
        id: 140,
        amount: 34571.21,
        payment_ref: 'VIREMENT de HEOL ACADEMY FACT HEO0001 SOLUVIA',
        partner_name: null,
        date: '2026-05-22',
      },
    ]);

    const { client, ops } = buildSupabase(baseHandlers());
    const { syncOdoo } = await import('@/lib/odoo/sync');
    await syncOdoo(client as never);

    const notifInsert = ops.find(
      (o) => o.op === 'insert' && o.table === 'notifications',
    );
    expect(notifInsert).toBeDefined();
    const rows = notifInsert!.payload as Array<{
      type: string;
      user_id: string;
      titre: string;
      message: string;
      lien: string;
    }>;
    expect(rows).toHaveLength(2); // une notif par admin
    expect(rows.every((r) => r.type === 'erreur_sync')).toBe(true);
    expect(rows[0]!.titre).toContain('non lettré');
    expect(rows[0]!.lien).toBe('/facturation/FAC-HEO-0001');
    expect(rows[0]!.message).toContain('FAC-HEO-0001');
    expect(new Set(rows.map((r) => r.user_id))).toEqual(
      new Set(['admin-1', 'admin-2']),
    );
  });

  it('ligne bancaire de montant different -> aucune notification (faux positif evite)', async () => {
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '134',
        payment_state: 'not_paid',
        amount_total: 34571.21,
        amount_residual: 34571.21,
        payments: [],
      },
    ]);
    odooMock.findUnreconciledIncomingBankLines.mockResolvedValue([
      {
        id: 999,
        amount: 6147.56, // autre montant -> ne matche pas FAC-HEO-0001
        payment_ref: 'VIREMENT HEOL ACADEMY FACT HEO0001',
        partner_name: null,
        date: '2026-05-22',
      },
    ]);

    const { client, ops } = buildSupabase(baseHandlers());
    const { syncOdoo } = await import('@/lib/odoo/sync');
    await syncOdoo(client as never);

    expect(
      ops.find((o) => o.op === 'insert' && o.table === 'notifications'),
    ).toBeUndefined();
  });

  it('notification deja existante pour ce lien -> pas de doublon (idempotent)', async () => {
    odooMock.pullInvoicePayments.mockResolvedValue([
      {
        invoice_odoo_id: '134',
        payment_state: 'not_paid',
        amount_total: 34571.21,
        amount_residual: 34571.21,
        payments: [],
      },
    ]);
    odooMock.findUnreconciledIncomingBankLines.mockResolvedValue([
      {
        id: 140,
        amount: 34571.21,
        payment_ref: 'VIREMENT HEOL ACADEMY FACT HEO0001',
        partner_name: null,
        date: '2026-05-22',
      },
    ]);

    const { client, ops } = buildSupabase(
      baseHandlers([{ lien: '/facturation/FAC-HEO-0001' }]),
    );
    const { syncOdoo } = await import('@/lib/odoo/sync');
    await syncOdoo(client as never);

    expect(
      ops.find((o) => o.op === 'insert' && o.table === 'notifications'),
    ).toBeUndefined();
  });
});
