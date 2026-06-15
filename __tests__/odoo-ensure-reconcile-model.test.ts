import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOdooClient } from '@/lib/odoo/client';

/**
 * ensureAutoReconcileModel : provisioning idempotent du account.reconcile.model
 * trigger=auto_reconcile par client (rapprochement bancaire automatique).
 * Verifie : creation quand absent, pas d'ecriture quand deja au bon trigger,
 * upgrade manual -> auto_reconcile, pas de doublon si un modele fait main
 * mappe deja le partenaire, skip sans company_id.
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
  return {
    model: parsed.params.args[3] as string,
    method: parsed.params.args[4] as string,
    args: parsed.params.args[5] as unknown[],
  };
}

const KEYS = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'] as const;

describe('ensureAutoReconcileModel', () => {
  const saved: Record<string, string | undefined> = {};
  const kwCalls: KwCall[] = [];

  // Etat simule cote Odoo, configurable par test.
  let partnerSearchResult: number[] = [13];
  let journalSearchResult: number[] = [8];
  let modelByName: Array<{ id: number; trigger: string }> = [];
  let modelByPartner: Array<{ id: number }> = [];

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.ODOO_URL = 'https://odoo.test';
    process.env.ODOO_DB = 'testdb';
    process.env.ODOO_USERNAME = 'tech@test';
    process.env.ODOO_API_KEY = 'test-key';
    kwCalls.length = 0;
    partnerSearchResult = [13];
    journalSearchResult = [8];
    modelByName = [];
    modelByPartner = [];

    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const parsed = JSON.parse(init.body) as {
        params: { service: string; method: string };
      };
      let result: unknown = [];
      if (parsed.params.service === 'common') {
        result = 7; // authenticate -> uid
      } else {
        const call = decodeKw(init.body)!;
        kwCalls.push(call);
        if (call.model === 'res.partner') result = partnerSearchResult;
        else if (call.model === 'account.journal') result = journalSearchResult;
        else if (
          call.model === 'account.reconcile.model' &&
          call.method === 'search_read'
        ) {
          const domain = JSON.stringify(call.args[0]);
          result = domain.includes('mapped_partner_id')
            ? modelByPartner
            : modelByName;
        } else if (
          call.model === 'account.reconcile.model' &&
          call.method === 'create'
        ) {
          result = 99;
        } else if (
          call.model === 'account.reconcile.model' &&
          call.method === 'write'
        ) {
          result = true;
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
    raison_sociale: 'M&E CONSULTING',
    siret: '12345678900011',
    vat: 'FR00123456789',
    company_id: 1,
  };

  it('cree le modele auto_reconcile quand aucun modele n’existe', async () => {
    const odoo = createOdooClient();
    const res = await odoo.ensureAutoReconcileModel(input);

    expect(res.action).toBe('created');
    expect(res.model_odoo_id).toBe(99);

    const create = kwCalls.find(
      (c) => c.model === 'account.reconcile.model' && c.method === 'create',
    );
    expect(create).toBeDefined();
    const vals = (create!.args as Array<Record<string, unknown>>)[0];
    expect(vals).toMatchObject({
      name: 'Soluvia auto-match M&E CONSULTING',
      trigger: 'auto_reconcile',
      match_label: 'contains',
      match_label_param: 'M&E CONSULTING',
      mapped_partner_id: 13,
      company_id: 1,
      match_journal_ids: [[6, 0, [8]]],
    });

    // mapped_partner_id est compute readonly chez Odoo : ignore au create.
    // Le client DOIT re-ecrire le champ apres create, sinon le modele ne
    // rattache aucun partenaire et ne lettre rien.
    const postCreateWrite = kwCalls.find(
      (c) => c.model === 'account.reconcile.model' && c.method === 'write',
    );
    expect(postCreateWrite).toBeDefined();
    expect(postCreateWrite!.args).toEqual([[99], { mapped_partner_id: 13 }]);
  });

  it('n’ecrit rien quand le modele existe deja en auto_reconcile', async () => {
    modelByName = [{ id: 10, trigger: 'auto_reconcile' }];
    const odoo = createOdooClient();
    const res = await odoo.ensureAutoReconcileModel(input);

    expect(res).toMatchObject({ model_odoo_id: 10, action: 'skipped' });
    expect(
      kwCalls.some(
        (c) =>
          c.model === 'account.reconcile.model' &&
          (c.method === 'create' || c.method === 'write'),
      ),
    ).toBe(false);
  });

  it('upgrade un modele existant manual -> auto_reconcile', async () => {
    modelByName = [{ id: 10, trigger: 'manual' }];
    const odoo = createOdooClient();
    const res = await odoo.ensureAutoReconcileModel(input);

    expect(res).toMatchObject({ model_odoo_id: 10, action: 'updated' });
    const write = kwCalls.find(
      (c) => c.model === 'account.reconcile.model' && c.method === 'write',
    );
    expect(write).toBeDefined();
    expect(JSON.stringify(write!.args)).toContain('auto_reconcile');
  });

  it('ne duplique pas un modele fait main mappant deja le partenaire', async () => {
    modelByPartner = [{ id: 7 }];
    const odoo = createOdooClient();
    const res = await odoo.ensureAutoReconcileModel(input);

    expect(res).toMatchObject({ model_odoo_id: 7, action: 'skipped' });
    expect(
      kwCalls.some(
        (c) => c.model === 'account.reconcile.model' && c.method === 'create',
      ),
    ).toBe(false);
  });

  it('skip proprement sans company_id ou sans partner resolvable', async () => {
    const odoo = createOdooClient();

    const noCompany = await odoo.ensureAutoReconcileModel({
      ...input,
      company_id: null,
    });
    expect(noCompany.action).toBe('skipped');
    expect(noCompany.reason).toContain('company_id');

    partnerSearchResult = [];
    const noPartner = await odoo.ensureAutoReconcileModel(input);
    expect(noPartner.action).toBe('skipped');
    expect(noPartner.reason).toContain('partner');
  });
});
