import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOdooClient } from '@/lib/odoo/client';

/**
 * Regression: SOLUVIA ne facture que des prestations de services. La selection
 * de taxe Odoo (findSaleTax) DOIT cibler la taxe de portee 'service' (ex.
 * "20% S") et jamais la taxe "biens" (ex. "20% G", tax_scope=consu) que Odoo
 * renvoie souvent en premier. Sinon les prestations sont ventilees a tort en
 * livraisons de biens sur la CA3. Cf. lib/odoo/client.ts findSaleTax.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const SERVICE_TAX_ID = 38; // "20% S"
const GOODS_TAX_ID = 30; // "20% G"

interface DecodedCall {
  service: string;
  method: string;
  model?: string;
  modelMethod?: string;
  modelArgs?: unknown[];
}

function decode(body: string): DecodedCall {
  const parsed = JSON.parse(body) as {
    params: { service: string; method: string; args: unknown[] };
  };
  const { service, method, args } = parsed.params;
  if (service === 'common') return { service, method };
  // object/execute_kw: [db, uid, key, model, modelMethod, modelArgs, kwargs]
  return {
    service,
    method,
    model: args[3] as string,
    modelMethod: args[4] as string,
    modelArgs: args[5] as unknown[],
  };
}

describe('findSaleTax - preference taxe de service', () => {
  const KEYS = [
    'ODOO_URL',
    'ODOO_DB',
    'ODOO_USERNAME',
    'ODOO_API_KEY',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.ODOO_URL = 'https://odoo.test';
    process.env.ODOO_DB = 'testdb';
    process.env.ODOO_USERNAME = 'tech@test';
    process.env.ODOO_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cible la taxe service (20% S) et n\u2019utilise jamais la taxe biens (20% G)', async () => {
    const taxSearchDomains: string[] = [];

    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const call = decode(init.body);
      let result: unknown = [];

      if (call.service === 'common') {
        result =
          call.method === 'authenticate' ? 7 : { server_version: 'test' };
      } else if (
        call.model === 'res.partner' &&
        call.modelMethod === 'search'
      ) {
        result = [42]; // partner existant -> pas de create
      } else if (
        call.model === 'account.tax' &&
        call.modelMethod === 'search'
      ) {
        const domainJson = JSON.stringify(call.modelArgs?.[0]);
        taxSearchDomains.push(domainJson);
        // Le vrai Odoo : la recherche scopee 'service' rend 38, sinon 30.
        result = domainJson.includes('"service"')
          ? [SERVICE_TAX_ID]
          : [GOODS_TAX_ID];
      } else if (
        call.model === 'account.move' &&
        call.modelMethod === 'search_read'
      ) {
        result = []; // pas de move existant
      } else if (
        call.model === 'account.move' &&
        call.modelMethod === 'create'
      ) {
        result = 999;
      } else if (
        call.model === 'account.move' &&
        call.modelMethod === 'action_post'
      ) {
        result = true;
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

    const odoo = createOdooClient();
    const res = await odoo.pushInvoice({
      ref: 'FAC-SOL-0006',
      partner_siret: '48908897100093',
      partner_name: 'ICADEMIE',
      partner_vat: 'FR14489088971',
      date_invoice: '2026-06-11',
      date_due: '2026-06-18',
      taux_tva: 20,
      lines: [{ description: 'Commission', quantity: 1, price_unit: 297.46 }],
      is_credit_note: false,
      odoo_company_id: 1,
      odoo_journal_id: 8,
    });

    expect(res.odoo_id).toBe('999');

    // La premiere (et ici unique) recherche de taxe doit cibler le scope service.
    expect(taxSearchDomains.length).toBeGreaterThan(0);
    expect(taxSearchDomains[0]).toContain('"service"');

    // Le move cree porte la taxe service (38), jamais la taxe biens (30).
    const createBody = fetchMock.mock.calls
      .map((c) => JSON.parse((c[1] as { body: string }).body))
      .find(
        (b) =>
          b.params.args?.[3] === 'account.move' &&
          b.params.args?.[4] === 'create',
      );
    const createJson = JSON.stringify(createBody);
    expect(createJson).toContain(`[6,0,[${SERVICE_TAX_ID}]]`);
    expect(createJson).not.toContain(`[6,0,[${GOODS_TAX_ID}]]`);
  });
});
