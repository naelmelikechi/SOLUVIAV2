// Set required env BEFORE importing client (loads @/lib/env).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.ODOO_URL = 'https://odoo.test';
process.env.ODOO_DB = 'testdb';
process.env.ODOO_USERNAME = 'tester';
process.env.ODOO_API_KEY = 'fake-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests du durcissement transport JSON-RPC Odoo :
 *  - timeout : chaque fetch porte un AbortSignal
 *  - retry avec backoff sur erreurs transitoires (5xx, timeout, reseau)
 *    UNIQUEMENT pour les methodes sans effet de bord (read/search...)
 *  - jamais de retry sur create/write/action_post (risque de doublon)
 *  - jamais de retry sur erreur applicative JSON-RPC (deterministe)
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createOdooClient } from '@/lib/odoo/client';

type KwCall = { model: string; method: string };

/**
 * Mock fetch JSON-RPC : `respond` reçoit l'appel décodé et peut
 *  - retourner une valeur -> reponse 200 {result}
 *  - retourner une Response brute (ex: 503)
 *  - throw (erreur reseau / timeout simulee)
 */
function makeFetchMock(
  respond: (call: {
    service: string;
    method: string;
    kw?: KwCall;
    attempt: number;
  }) => unknown,
) {
  const counts = new Map<string, number>();
  const inits: RequestInit[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    inits.push(init ?? {});
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      params: { service: string; method: string; args: unknown[] };
    };
    const { service, method, args } = body.params;
    let kw: KwCall | undefined;
    if (service === 'object' && method === 'execute_kw') {
      kw = { model: String(args[3]), method: String(args[4]) };
    }
    const key = kw ? `${kw.model}.${kw.method}` : `${service}.${method}`;
    const attempt = (counts.get(key) ?? 0) + 1;
    counts.set(key, attempt);

    const out = respond({ service, method, kw, attempt });
    if (out instanceof Response) return out;
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: out }), {
      status: 200,
    });
  });
  return { fetchMock, counts, inits };
}

const AUTH_OK = 7;

const MOVE_ROW = {
  id: 42,
  payment_state: 'paid',
  amount_total: 120,
  amount_residual: 0,
  invoice_payments_widget: {
    content: [{ amount: 120, date: '2026-06-01', partial_id: 1 }],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Odoo JSON-RPC transport hardening', () => {
  it('retry une lecture (read) apres un 503 transitoire', async () => {
    const { fetchMock, counts } = makeFetchMock(
      ({ service, method, kw, attempt }) => {
        if (service === 'common' && method === 'authenticate') return AUTH_OK;
        if (kw?.model === 'account.move' && kw.method === 'read') {
          if (attempt === 1) {
            return new Response('Service Unavailable', { status: 503 });
          }
          return [MOVE_ROW];
        }
        return [];
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    const payments = await odoo.pullInvoicePayments(['42']);

    expect(counts.get('account.move.read')).toBe(2);
    expect(payments.length).toBeGreaterThan(0);
  });

  it('retry apres un timeout (TimeoutError) sur une lecture', async () => {
    const { fetchMock, counts } = makeFetchMock(
      ({ service, method, kw, attempt }) => {
        if (service === 'common' && method === 'authenticate') return AUTH_OK;
        if (kw?.model === 'account.move' && kw.method === 'read') {
          if (attempt === 1) {
            throw new DOMException('The operation timed out', 'TimeoutError');
          }
          return [MOVE_ROW];
        }
        return [];
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(odoo.pullInvoicePayments(['42'])).resolves.toBeDefined();
    expect(counts.get('account.move.read')).toBe(2);
  });

  it('ne retry JAMAIS un create, meme sur 503', async () => {
    const { fetchMock, counts } = makeFetchMock(({ service, method, kw }) => {
      if (service === 'common' && method === 'authenticate') return AUTH_OK;
      if (kw?.model === 'account.move' && kw.method === 'read') {
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
      if (kw?.model === 'account.payment.register' && kw.method === 'create') {
        return new Response('Service Unavailable', { status: 503 });
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(
      odoo.registerPayment({
        invoice_odoo_id: '42',
        amount: 120,
        payment_date: '2026-06-01',
      }),
    ).rejects.toThrow(/503/);
    expect(counts.get('account.payment.register.create')).toBe(1);
  });

  it('ne retry pas une erreur applicative JSON-RPC (200 + error)', async () => {
    const { fetchMock, counts } = makeFetchMock(({ service, method, kw }) => {
      if (service === 'common' && method === 'authenticate') return AUTH_OK;
      if (kw?.model === 'account.move' && kw.method === 'read') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: 200,
              message: 'Odoo Server Error',
              data: { message: 'Record does not exist' },
            },
          }),
          { status: 200 },
        );
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await expect(odoo.pullInvoicePayments(['42'])).rejects.toThrow(
      /Record does not exist/,
    );
    expect(counts.get('account.move.read')).toBe(1);
  });

  it('retry authenticate apres un 503 (ping finit ok)', async () => {
    const { fetchMock, counts } = makeFetchMock(
      ({ service, method, attempt }) => {
        if (service === 'common' && method === 'authenticate') {
          if (attempt === 1) {
            return new Response('Bad Gateway', { status: 502 });
          }
          return AUTH_OK;
        }
        if (service === 'common' && method === 'version') {
          return { server_version: '17.0' };
        }
        return [];
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    const ping = await odoo.ping();

    expect(ping.ok).toBe(true);
    expect(counts.get('common.authenticate')).toBe(2);
  });

  it('borne chaque requete avec un AbortSignal (timeout)', async () => {
    const { fetchMock, inits } = makeFetchMock(({ service, method }) => {
      if (service === 'common' && method === 'authenticate') return AUTH_OK;
      if (service === 'common' && method === 'version') {
        return { server_version: '17.0' };
      }
      return [];
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const odoo = createOdooClient();
    await odoo.ping();

    expect(inits.length).toBeGreaterThan(0);
    for (const init of inits) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
