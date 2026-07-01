// Required env BEFORE any import that loads @/lib/env (zod-validated).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Tests vitest pour la Phase 5 de /lib/eduvia/sync.ts :
 * sync des lignes des bordereaux OPCO d'un contrat (eduvia_invoice_lines),
 * via l'endpoint documente contracts/:id/invoice_lines.
 *
 * Couverture :
 *  - Les lignes du contrat sont upsertes dans eduvia_invoice_lines
 *  - Un contrat sans step emis (aucun invoice_id) ne declenche aucun fetch
 *  - EndpointNotAvailableError est avalee gracieusement (degradation silencieuse)
 *  - Les erreurs HTTP non-404 sont poussees dans result.errors
 *  - result.invoice_lines compte les lignes inserees
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const fetchAllPagesMock = vi.fn();
const fetchOneMock = vi.fn();
const fetchListMock = vi.fn();
const fetchStatusMock = vi.fn();
const fetchContractInvoiceLinesMock = vi.fn();
const fetchContractInvoicesMock = vi.fn();

class EndpointNotAvailableError extends Error {
  constructor(public resource: string) {
    super(`Endpoint /api/v1/${resource} pas encore disponible`);
    this.name = 'EndpointNotAvailableError';
  }
}
class AuthError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`Eduvia ${status} auth refusée pour ${url}`);
    this.name = 'AuthError';
  }
}

vi.mock('@/lib/eduvia/client', () => ({
  fetchAllPages: (...args: unknown[]) => fetchAllPagesMock(...args),
  fetchOne: (...args: unknown[]) => fetchOneMock(...args),
  fetchList: (...args: unknown[]) => fetchListMock(...args),
  fetchStatus: (...args: unknown[]) => fetchStatusMock(...args),
  fetchContractInvoiceLines: (...args: unknown[]) =>
    fetchContractInvoiceLinesMock(...args),
  fetchContractInvoices: (...args: unknown[]) =>
    fetchContractInvoicesMock(...args),
  EndpointNotAvailableError,
  AuthError,
}));

const decryptApiKeyMock = vi.fn();
vi.mock('@/lib/utils/encryption', () => ({
  decryptApiKey: (cipher: string) => decryptApiKeyMock(cipher),
}));

const detectNpecMock = vi.fn();
const detectRuptureMock = vi.fn();
vi.mock('@/lib/echeancier/ajustements', () => ({
  detectNpecChangeAjustement: (...args: unknown[]) => detectNpecMock(...args),
  detectRuptureAjustement: (...args: unknown[]) => detectRuptureMock(...args),
}));

// ---------------------------------------------------------------------------
// Supabase mock (same pattern as eduvia-sync.test.ts)
// ---------------------------------------------------------------------------

interface RecordedOp {
  table: string;
  op: 'select' | 'update' | 'upsert' | 'insert' | 'delete';
  filters: Array<{ col: string; val: unknown }>;
  payload?: unknown;
  options?: unknown;
}

interface TableRules {
  select?: () => { data: unknown[] | null; error: unknown };
  upsert?: (
    payload: unknown,
    opts?: unknown,
  ) => { data?: unknown; error: unknown };
  update?: () => { error: unknown };
  delete?: () => { error: unknown };
}

function buildSupabase(rules: Record<string, TableRules>) {
  const ops: RecordedOp[] = [];

  function selectChain(op: RecordedOp, rule?: TableRules['select']) {
    const settle = () => {
      const r = rule ? rule() : { data: [], error: null };
      return Promise.resolve(r);
    };
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        op.filters.push({ col, val: vals });
        return chain;
      },
      not(col: string, _operator: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      maybeSingle() {
        return settle().then((r) => ({
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null),
          error: r.error,
        }));
      },
      single() {
        return settle().then((r) => ({
          data: Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null),
          error: r.error,
        }));
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return chain;
  }

  function updateChain(op: RecordedOp, rule?: TableRules['update']) {
    const settle = () => Promise.resolve(rule ? rule() : { error: null });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return chain;
  }

  function deleteChain(op: RecordedOp, rule?: TableRules['delete']) {
    const settle = () => Promise.resolve(rule ? rule() : { error: null });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      not(col: string, _operator: string, val: unknown) {
        op.filters.push({ col, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        op.filters.push({ col, val: vals });
        return chain;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    ops,
    client: {
      from(table: string) {
        const tableRules = rules[table];
        return {
          select(_cols?: string) {
            const op: RecordedOp = { table, op: 'select', filters: [] };
            ops.push(op);
            return selectChain(op, tableRules?.select);
          },
          upsert(payload: unknown, options?: unknown) {
            const op: RecordedOp = {
              table,
              op: 'upsert',
              filters: [],
              payload,
              options,
            };
            ops.push(op);
            const r = tableRules?.upsert
              ? tableRules.upsert(payload, options)
              : { error: null };
            return Promise.resolve(r);
          },
          update(payload: unknown) {
            const op: RecordedOp = {
              table,
              op: 'update',
              filters: [],
              payload,
            };
            ops.push(op);
            return updateChain(op, tableRules?.update);
          },
          insert(payload: unknown) {
            const op: RecordedOp = {
              table,
              op: 'insert',
              filters: [],
              payload,
            };
            ops.push(op);
            return Promise.resolve({ error: null });
          },
          delete() {
            const op: RecordedOp = { table, op: 'delete', filters: [] };
            ops.push(op);
            return deleteChain(op, tableRules?.delete);
          },
        };
      },
    } as unknown as SupabaseClient<Database>,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-heol';
const CONTRAT_UUID = 'contrat-uuid-001';

/** Un contrat Eduvia minimal pour le mock fetchAllPages('contracts'). */
function contractFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    employee_id: 10,
    company_id: 20,
    formation_id: 30,
    teacher_id: null,
    campus_id: 5,
    contract_number: 'CTR-001',
    internal_number: 'INT-001',
    contract_type: 11,
    contract_mode: 1,
    contract_state: 'VALIDE',
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-12-31',
    contract_conclusion_date: null,
    practical_training_start_date: null,
    creation_mode: 'NORMAL',
    support: null,
    support_first_equipment: null,
    npec_amount: 5000,
    referrer_name: null,
    referrer_amount: null,
    referrer_type: 'NONE',
    accepted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Step Eduvia avec invoice emis (pedago). */
const STEP_PEDAGO = {
  id: 100,
  contract_id: 1,
  invoice_id: 200,
  step_number: 1,
  opening_date: '2026-03-01',
  total_amount: 2666.56,
  including_pedagogie_amount: 2666.56,
  including_rqth_amount: 0,
  paid_amount: 0,
  in_progress_amount: 2666.56,
  siret_cfa: '12345678901234',
  external_code: 'EXT-100',
  invoice_state: 'EMIS',
  invoice_sent_at: '2026-03-05T10:00:00Z',
  paid_at: null,
};

/** Step Eduvia avec invoice emis (matos). */
const STEP_MATOS = {
  id: 101,
  contract_id: 1,
  invoice_id: 201,
  step_number: 2,
  opening_date: '2026-06-01',
  total_amount: 500,
  including_pedagogie_amount: 0,
  including_rqth_amount: 0,
  paid_amount: 0,
  in_progress_amount: 500,
  siret_cfa: '12345678901234',
  external_code: 'EXT-101',
  invoice_state: 'EMIS',
  invoice_sent_at: '2026-06-05T10:00:00Z',
  paid_at: null,
};

const LINE_PEDAGO = {
  id: 79,
  invoice_id: 200,
  amount: 2666.56,
  line_type: 'PEDAGOGIE',
  quantity: 1,
  description: 'Echéance n°1 - Frais pédagogiques',
  created_at: '2026-05-07T16:11:22.891+02:00',
  updated_at: '2026-05-07T16:11:22.891+02:00',
};

const LINE_MATOS = {
  id: 80,
  invoice_id: 201,
  amount: 500,
  line_type: 'PREMIEREQUIPEMENT',
  quantity: 1,
  description: 'Premier équipement informatique',
  created_at: '2026-05-07T16:11:22.891+02:00',
  updated_at: '2026-05-07T16:11:22.891+02:00',
};

// ---------------------------------------------------------------------------
// Supabase rules helpers
// ---------------------------------------------------------------------------

function projetsRule(projetId = 'projet-heol') {
  return {
    select: () => ({
      data: [{ id: projetId, client_id: CLIENT_ID, archive: false }],
      error: null,
    }),
  };
}

/** contrats table rule: upsert succeeds; select returns the UUID mapping.
 *  eduvia_id is a number (DB type bigint/int8), matching contract.id from the API.
 */
function contratsRule() {
  return {
    upsert: () => ({ error: null }),
    select: () => ({
      data: [
        {
          id: CONTRAT_UUID,
          eduvia_id: 1,
          npec_amount: null,
          contract_state: 'VALIDE',
          archive: false,
          date_fin: null,
        },
      ],
      error: null,
    }),
  };
}

// ---------------------------------------------------------------------------
// beforeEach : reset mocks to safe defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  fetchStatusMock.mockResolvedValue({
    status: 'ok',
    version: '1.0.0',
    authenticated: 'ok',
  });

  // fetchAllPages: return one contract for 'contracts', empty for others
  fetchAllPagesMock.mockImplementation(
    async (_url: string, _key: string, resource: string) => {
      if (resource === 'contracts') return [contractFixture()];
      return [];
    },
  );

  // fetchOne (progressions): not available
  fetchOneMock.mockRejectedValue(new EndpointNotAvailableError('progressions'));

  // fetchList (invoice_steps, invoice_forecast_steps): default to not available
  // Tests override this per-case for steps
  fetchListMock.mockRejectedValue(
    new EndpointNotAvailableError('invoice_steps'),
  );

  // fetchContractInvoiceLines: default to not available (graceful degradation)
  fetchContractInvoiceLinesMock.mockRejectedValue(
    new EndpointNotAvailableError('contracts/0/invoice_lines'),
  );

  // fetchContractInvoices: pas de facture par defaut (tracabilite best-effort)
  fetchContractInvoicesMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncEduviaForClient — Phase 5 : sync invoice lines', () => {
  it('upserte 2 lignes dans eduvia_invoice_lines (1 pedago + 1 matos) et incrémente invoice_lines', async () => {
    // fetchList handles invoice_steps and invoice_forecast_steps
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps')
          return [STEP_PEDAGO, STEP_MATOS];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    // fetchContractInvoiceLines(instanceUrl, apiKey, contractId): une requete
    // par contrat renvoie toutes les lignes de ses bordereaux emis.
    fetchContractInvoiceLinesMock.mockImplementation(
      async (_url: string, _key: string, contractId: number) => {
        if (contractId === 1) return [LINE_PEDAGO, LINE_MATOS];
        return [];
      },
    );

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      contrats_progressions: { upsert: () => ({ error: null }) },
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.errors).toHaveLength(0);
    expect(res.invoice_lines).toBe(2);

    // Verify the upsert ops on eduvia_invoice_lines
    const lineOps = supa.ops.filter(
      (o) => o.op === 'upsert' && o.table === 'eduvia_invoice_lines',
    );
    expect(lineOps).toHaveLength(2);

    // Check pedago line payload
    const pedaOp = lineOps.find(
      (o) => (o.payload as { eduvia_id: number }).eduvia_id === 79,
    );
    expect(pedaOp).toBeDefined();
    const pedaPayload = pedaOp!.payload as Record<string, unknown>;
    expect(pedaPayload.source_client_id).toBe(CLIENT_ID);
    expect(pedaPayload.contrat_id).toBe(CONTRAT_UUID);
    expect(pedaPayload.eduvia_invoice_id).toBe(200);
    expect(pedaPayload.amount).toBe(2666.56);
    expect(pedaPayload.line_type).toBe('PEDAGOGIE');
    expect(pedaOp!.options).toEqual({
      onConflict: 'eduvia_id,source_client_id',
    });

    // Check matos line payload
    const matOp = lineOps.find(
      (o) => (o.payload as { eduvia_id: number }).eduvia_id === 80,
    );
    expect(matOp).toBeDefined();
    const matPayload = matOp!.payload as Record<string, unknown>;
    expect(matPayload.source_client_id).toBe(CLIENT_ID);
    expect(matPayload.line_type).toBe('PREMIEREQUIPEMENT');
  });

  it('ignore les steps sans invoice_id (step non emis)', async () => {
    const stepNoInvoice = { ...STEP_PEDAGO, id: 102, invoice_id: null };

    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [stepNoInvoice];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.invoice_lines).toBe(0);
    const lineOps = supa.ops.filter(
      (o) => o.op === 'upsert' && o.table === 'eduvia_invoice_lines',
    );
    expect(lineOps).toHaveLength(0);
    // fetchContractInvoiceLines should never have been called
    expect(fetchContractInvoiceLinesMock).not.toHaveBeenCalled();
  });

  it('avale EndpointNotAvailableError sur contracts/:id/invoice_lines sans erreur dans result', async () => {
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    // fetchContractInvoiceLines throws EndpointNotAvailableError -> swallowed
    fetchContractInvoiceLinesMock.mockRejectedValue(
      new EndpointNotAvailableError('contracts/1/invoice_lines'),
    );

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.invoice_lines).toBe(0);
    // EndpointNotAvailableError should not propagate to errors
    const lineErrors = res.errors.filter((e) => e.includes('invoice_lines'));
    expect(lineErrors).toHaveLength(0);
  });

  it('pousse une erreur dans result.errors si fetchContractInvoiceLines lance une erreur non-404', async () => {
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    fetchContractInvoiceLinesMock.mockRejectedValue(
      new Error('connection timeout'),
    );

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.invoice_lines).toBe(0);
    const lineErrors = res.errors.filter((e) => e.includes('invoice_lines'));
    expect(lineErrors).toHaveLength(1);
    expect(lineErrors[0]).toMatch(/contrat=1.*connection timeout/);
  });

  it('pousse une erreur dans result.errors si l upsert supabase echoue', async () => {
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    fetchContractInvoiceLinesMock.mockResolvedValue([LINE_PEDAGO]);

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: {
        upsert: () => ({ error: { message: 'constraint violation' } }),
      },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.invoice_lines).toBe(0);
    expect(res.errors.some((e) => e.includes('eduvia_id=79'))).toBe(true);
  });

  it('I2: supprime les lignes orphelines quand Eduvia supprime une ligne entre 2 syncs', async () => {
    // Setup : Eduvia retourne seulement la ligne pedago (id=79, invoice_id=200).
    // La ligne OLD_LINE (id=999) existait en DB mais n'est plus dans la reponse API.
    // On attend que le Delete soit emis pour le contrat, excluant eduvia_id=79.
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    // Eduvia retourne seulement la ligne existante (OLD_LINE est partie)
    fetchContractInvoiceLinesMock.mockResolvedValue([LINE_PEDAGO]); // uniquement id=79

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: {
        // Diff en memoire : le select renvoie les lignes DB du contrat
        // (conservee 79 + orpheline 999). L'orpheline est celle absente de l'API.
        select: () => ({
          data: [
            { id: 'line-pk-79', eduvia_id: 79 },
            { id: 'line-pk-999', eduvia_id: 999 },
          ],
          error: null,
        }),
        upsert: () => ({ error: null }),
        delete: () => ({ error: null }),
      },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.errors).toHaveLength(0);
    expect(res.invoice_lines).toBe(1); // ligne pedago upserée

    // Verify que le delete orphan a ete emis pour eduvia_invoice_lines
    const deleteOps = supa.ops.filter(
      (o) => o.op === 'delete' && o.table === 'eduvia_invoice_lines',
    );
    expect(deleteOps).toHaveLength(1);

    // Delete par PK : .in('id', [orphelines]) — cible la ligne 999, epargne 79.
    const deleteOp = deleteOps[0]!;
    const idFilter = deleteOp.filters.find((f) => f.col === 'id');
    expect(idFilter).toBeDefined();
    expect(idFilter!.val).toEqual(['line-pk-999']);
    expect(JSON.stringify(idFilter!.val)).not.toContain('line-pk-79');
  });

  it('I2: si Eduvia retourne 0 lignes, skip delete pour eviter wipe', async () => {
    // Anti-wipe : si l API retourne lines=[] (bug transitoire ou retraitement
    // Eduvia), on ne doit PAS supprimer les lignes existantes cote DB. Sans
    // ce garde-fou, un seul appel buggy effaceraient toute l historique
    // de commission pour cette facture.
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );

    fetchContractInvoiceLinesMock.mockResolvedValue([]);

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: {
        upsert: () => ({ error: null }),
        delete: () => ({ error: null }),
      },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    expect(res.invoice_lines).toBe(0);

    // Aucun delete ne doit etre emis : garde-fou anti-wipe.
    const deleteOps = supa.ops.filter(
      (o) => o.op === 'delete' && o.table === 'eduvia_invoice_lines',
    );
    expect(deleteOps).toHaveLength(0);
  });
});

describe('syncEduviaForClient — traçabilité invoice_number/external_number', () => {
  it('enrichit le step émis avec invoice_number/external_number depuis /invoices', async () => {
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );
    fetchContractInvoicesMock.mockResolvedValue([
      {
        id: 200,
        invoice_number: 'HEOL-EDV-FAC-2026-54',
        external_number: '7633946',
      },
    ]);

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    const stepOp = supa.ops.find(
      (o) => o.op === 'upsert' && o.table === 'eduvia_invoice_steps',
    );
    expect(stepOp).toBeDefined();
    const payload = stepOp!.payload as Record<string, unknown>;
    expect(payload.eduvia_invoice_id).toBe(200);
    expect(payload.invoice_number).toBe('HEOL-EDV-FAC-2026-54');
    expect(payload.external_number).toBe('7633946');
  });

  it('met les réfs à null sans casser la sync quand /invoices échoue', async () => {
    fetchListMock.mockImplementation(
      async (_url: string, _key: string, resource: string) => {
        if (resource === 'contracts/1/invoice_steps') return [STEP_PEDAGO];
        if (resource === 'contracts/1/invoice_forecast_steps') return [];
        return [];
      },
    );
    fetchContractInvoicesMock.mockRejectedValue(new Error('boom'));

    const supa = buildSupabase({
      projets: projetsRule(),
      contrats: contratsRule(),
      eduvia_invoice_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_forecast_steps: { upsert: () => ({ error: null }) },
      eduvia_invoice_lines: { upsert: () => ({ error: null }) },
    });

    const { syncEduviaForClient } = await import('@/lib/eduvia/sync');
    const res = await syncEduviaForClient(
      supa.client,
      CLIENT_ID,
      'heol.eduvia.app',
      'fake-key',
    );

    const stepOp = supa.ops.find(
      (o) => o.op === 'upsert' && o.table === 'eduvia_invoice_steps',
    );
    const payload = stepOp!.payload as Record<string, unknown>;
    expect(payload.invoice_number).toBeNull();
    expect(payload.external_number).toBeNull();
    expect(res.invoice_steps).toBe(1);
  });
});
