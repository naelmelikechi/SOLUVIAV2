// Set required env BEFORE importing client (loads @/lib/env).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.ODOO_URL = 'https://odoo.test';
process.env.ODOO_DB = 'testdb';
process.env.ODOO_USERNAME = 'tester';
process.env.ODOO_API_KEY = 'fake-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour OdooJsonRpcClient.registerPayment.
 *
 * On mocke globalThis.fetch et on verifie la sequence d'appels JSON-RPC :
 *  1. authenticate (common.authenticate)
 *  2. account.move.read pour valider l'etat de la facture
 *  3. account.payment.register.create avec active_ids contextualise
 *  4. account.payment.register.action_create_payments
 *
 * On verifie aussi les gardes : facture non posted, deja payee, montant
 * superieur au reste a payer.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createOdooClient } from '@/lib/odoo/client';

type RpcCall = {
  service: string;
  method: string;
  args: unknown[];
};

function makeFetchMock(
  responder: (call: { method: string; model?: string }) => unknown,
) {
  const calls: RpcCall[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      method: string;
      params: { service: string; method: string; args: unknown[] };
    };
    const { service, method, args } = body.params;
    calls.push({ service, method, args });

    // common.authenticate
    if (service === 'common' && method === 'authenticate') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', result: 7 }), {
        status: 200,
      });
    }
    // object.execute_kw : args = [db, uid, key, model, method, args, kwargs]
    if (service === 'object' && method === 'execute_kw') {
      const model = String(args[3]);
      const modelMethod = String(args[4]);
      const result = responder({ method: modelMethod, model });
      return new Response(JSON.stringify({ jsonrpc: '2.0', result }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: null }), {
      status: 200,
    });
  });
  return { fetchMock, calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OdooJsonRpcClient.registerPayment', () => {
  it('refuse si la facture n est pas posted', async () => {
    const { fetchMock } = makeFetchMock(({ method, model }) => {
      if (model === 'account.move' && method === 'read') {
        return [
          {
            id: 42,
            state: 'draft',
            payment_state: 'not_paid',
            move_type: 'out_invoice',
            amount_residual: 120,
            name: 'INV/2026/0001',
          },
        ];
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(
      odoo.registerPayment({
        invoice_odoo_id: '42',
        amount: 120,
        payment_date: '2026-05-24',
      }),
    ).rejects.toThrow(/non posted/);
  });

  it('refuse si la facture est deja payee', async () => {
    const { fetchMock } = makeFetchMock(({ method, model }) => {
      if (model === 'account.move' && method === 'read') {
        return [
          {
            id: 42,
            state: 'posted',
            payment_state: 'paid',
            move_type: 'out_invoice',
            amount_residual: 0,
            name: 'INV/2026/0001',
          },
        ];
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(
      odoo.registerPayment({
        invoice_odoo_id: '42',
        amount: 120,
        payment_date: '2026-05-24',
      }),
    ).rejects.toThrow(/deja payee/);
  });

  it('refuse si le montant depasse le reste a payer', async () => {
    const { fetchMock } = makeFetchMock(({ method, model }) => {
      if (model === 'account.move' && method === 'read') {
        return [
          {
            id: 42,
            state: 'posted',
            payment_state: 'partial',
            move_type: 'out_invoice',
            amount_residual: 50,
            name: 'INV/2026/0001',
          },
        ];
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(
      odoo.registerPayment({
        invoice_odoo_id: '42',
        amount: 120,
        payment_date: '2026-05-24',
      }),
    ).rejects.toThrow(/superieur au reste/);
  });

  it('flow nominal : cree le wizard avec active_ids puis action_create_payments', async () => {
    const { fetchMock, calls } = makeFetchMock(({ method, model }) => {
      if (model === 'account.move' && method === 'read') {
        return [
          {
            id: 42,
            state: 'posted',
            payment_state: 'not_paid',
            move_type: 'out_invoice',
            amount_residual: 120,
            name: 'INV/2026/0001',
          },
        ];
      }
      if (model === 'account.payment.register' && method === 'create') {
        return 7;
      }
      if (
        model === 'account.payment.register' &&
        method === 'action_create_payments'
      ) {
        return { res_id: 99 };
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    const result = await odoo.registerPayment({
      invoice_odoo_id: '42',
      amount: 120,
      payment_date: '2026-05-24',
      communication: 'FAC-HEO-0001',
    });

    expect(result.odoo_id).toBe('99-42');

    // Le wizard create doit etre appele avec active_ids=[42] dans le kwargs context
    const createCall = calls.find(
      (c) =>
        c.service === 'object' &&
        c.args[3] === 'account.payment.register' &&
        c.args[4] === 'create',
    );
    expect(createCall).toBeDefined();
    const kwargs = createCall!.args[6] as {
      context?: { active_ids?: number[] };
    };
    expect(kwargs.context?.active_ids).toEqual([42]);

    const wizardPayload = (createCall!.args[5] as unknown[])[0] as {
      amount: number;
      payment_date: string;
      communication: string;
    };
    expect(wizardPayload.amount).toBe(120);
    expect(wizardPayload.payment_date).toBe('2026-05-24');
    expect(wizardPayload.communication).toBe('FAC-HEO-0001');
  });

  it('fallback sur search_read si action ne retourne pas res_id', async () => {
    const { fetchMock } = makeFetchMock(({ method, model }) => {
      if (model === 'account.move' && method === 'read') {
        return [
          {
            id: 42,
            state: 'posted',
            payment_state: 'not_paid',
            move_type: 'out_invoice',
            amount_residual: 120,
            name: 'INV/2026/0001',
          },
        ];
      }
      if (model === 'account.payment.register' && method === 'create') {
        return 7;
      }
      if (
        model === 'account.payment.register' &&
        method === 'action_create_payments'
      ) {
        // Pas de res_id - simule retour ambigu
        return false;
      }
      if (model === 'account.payment' && method === 'search_read') {
        return [{ id: 123 }];
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    const result = await odoo.registerPayment({
      invoice_odoo_id: '42',
      amount: 120,
      payment_date: '2026-05-24',
    });

    expect(result.odoo_id).toBe('123-42');
  });
});
