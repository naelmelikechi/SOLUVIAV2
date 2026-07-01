import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOdooClient } from '@/lib/odoo/client';

/**
 * pushAnalyticLineForMove : idempotence cote Odoo via search-before-create
 * (calque de pushMove). Verifie : reutilisation d'une ligne existante sans
 * create (ferme le trou "create OK / persist KO" documente dans sync.ts),
 * create quand aucune ligne ne matche, skip quand le compte est introuvable,
 * et discrimination par montant (pas de faux positif d'idempotence).
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

interface KwCall {
  model: string;
  method: string;
  args: unknown[];
}

function decodeKw(body: string): KwCall | null {
  const parsed = JSON.parse(body) as {
    params: { service: string; method: string; args: unknown[] };
  };
  if (parsed.params.service !== 'object') return null;
  const [, , , model, method, args] = parsed.params.args as [
    unknown,
    unknown,
    unknown,
    string,
    string,
    unknown[],
  ];
  return { model, method, args };
}

const KEYS = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'] as const;

describe('pushAnalyticLineForMove — idempotence', () => {
  const saved: Record<string, string | undefined> = {};
  const kwCalls: KwCall[] = [];

  // Etat simule cote Odoo, configurable par test.
  let accountSearchResult: number[] = [12];
  let lineSearchReadResult: { id: number }[] = [];
  let createResult = 77;

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.ODOO_URL = 'https://odoo.test';
    process.env.ODOO_DB = 'testdb';
    process.env.ODOO_USERNAME = 'tech@test';
    process.env.ODOO_API_KEY = 'test-key';
    kwCalls.length = 0;
    accountSearchResult = [12];
    lineSearchReadResult = [];
    createResult = 77;

    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const parsed = JSON.parse(init.body) as {
        params: { service: string };
      };
      let result: unknown = [];
      if (parsed.params.service === 'common') {
        result = 7; // authenticate -> uid
      } else {
        const call = decodeKw(init.body)!;
        kwCalls.push(call);
        if (
          call.model === 'account.analytic.account' &&
          call.method === 'search'
        ) {
          result = accountSearchResult;
        } else if (
          call.model === 'account.analytic.line' &&
          call.method === 'search_read'
        ) {
          result = lineSearchReadResult;
        } else if (
          call.model === 'account.analytic.line' &&
          call.method === 'create'
        ) {
          result = createResult;
        }
      }
      const payload = { jsonrpc: '2.0', id: 1, result };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const input = {
    code_analytique: '41.01',
    amount: 1000,
    date: '2026-04-01',
    name: '[SOLUVIA-AUTO] FAC-SOL-0042 - Formation',
    company_id: 1,
  };

  const createCalls = () =>
    kwCalls.filter(
      (c) => c.model === 'account.analytic.line' && c.method === 'create',
    );
  const searchReadCalls = () =>
    kwCalls.filter(
      (c) => c.model === 'account.analytic.line' && c.method === 'search_read',
    );

  it('reuse_when_exists : ligne trouvee -> reutilisee, pas de create', async () => {
    lineSearchReadResult = [{ id: 99 }];

    const odoo = createOdooClient();
    const res = await odoo.pushAnalyticLineForMove(input);

    expect(res).toEqual({ analytic_line_odoo_id: 99, skipped: false });
    expect(searchReadCalls()).toHaveLength(1);
    expect(createCalls()).toHaveLength(0);

    // Le domaine de recherche discrimine sur (name, account_id, date, amount).
    const domain = searchReadCalls()[0]!.args[0] as unknown[];
    const flat = JSON.stringify(domain);
    expect(flat).toContain('name');
    expect(flat).toContain('account_id');
    expect(flat).toContain('date');
    expect(flat).toContain('amount');
  });

  it('create_when_absent : aucune ligne -> create appele une fois', async () => {
    lineSearchReadResult = [];
    createResult = 77;

    const odoo = createOdooClient();
    const res = await odoo.pushAnalyticLineForMove(input);

    expect(res).toEqual({ analytic_line_odoo_id: 77, skipped: false });
    expect(searchReadCalls()).toHaveLength(1);
    expect(createCalls()).toHaveLength(1);
  });

  it('skip_when_account_missing : compte introuvable -> ni search_read ni create', async () => {
    accountSearchResult = [];

    const odoo = createOdooClient();
    const res = await odoo.pushAnalyticLineForMove(input);

    expect(res.skipped).toBe(true);
    expect(res.analytic_line_odoo_id).toBeNull();
    expect(searchReadCalls()).toHaveLength(0);
    expect(createCalls()).toHaveLength(0);
  });

  it('discriminate_by_amount : montant different -> pas de faux positif, create part', async () => {
    // Une ligne amount=200 existe cote Odoo, mais on pousse amount=100 : le
    // search_read filtre sur amount ne renvoie rien -> create attendu.
    lineSearchReadResult = [];
    createResult = 55;

    const odoo = createOdooClient();
    const res = await odoo.pushAnalyticLineForMove({ ...input, amount: 100 });

    expect(res).toEqual({ analytic_line_odoo_id: 55, skipped: false });
    expect(createCalls()).toHaveLength(1);
    const domain = JSON.stringify(searchReadCalls()[0]!.args[0]);
    expect(domain).toContain('100');
  });
});
