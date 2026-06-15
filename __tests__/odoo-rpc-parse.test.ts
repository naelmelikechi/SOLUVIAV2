import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOdooClient } from '@/lib/odoo/client';

/**
 * Regression SOLUVIA-19 / -1A / -D : quand Odoo (ou un proxy/gateway en amont)
 * renvoie un statut 2xx avec un corps NON-JSON — typiquement une page HTML
 * (session expiree, page d'erreur du reverse-proxy) — le client doit lever une
 * OdooRpcError lisible mentionnant le content-type, et NON le SyntaxError
 * opaque "Unexpected token '<'" qui masquait la vraie cause en prod.
 */

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('OdooJsonRpcClient - reponse 2xx non-JSON (HTML)', () => {
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

  it('leve une OdooRpcError citant le content-type, pas le SyntaxError opaque', async () => {
    const html =
      '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/html; charset=utf-8' },
        text: async () => html,
        json: async () => {
          // Une vraie Response leverait ce SyntaxError sur du HTML.
          throw new SyntaxError(
            'Unexpected token \'<\', "<html>"... is not valid JSON',
          );
        },
      })),
    );

    const odoo = createOdooClient();
    const err = await odoo
      .pushInvoice({
        ref: 'FAC-SOL-0006',
        partner_siret: '48908897100093',
        partner_name: 'ICADEMIE',
        partner_vat: 'FR14489088971',
        date_invoice: '2026-06-11',
        date_due: '2026-06-18',
        taux_tva: 20,
        lines: [{ description: 'Commission', quantity: 1, price_unit: 1 }],
        is_credit_note: false,
        odoo_company_id: 1,
        odoo_journal_id: 8,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(Error);
    const message = String((err as Error).message);
    expect(message).toMatch(/non-JSON/i);
    expect(message).toMatch(/text\/html/i);
    // La cause opaque d'origine ne doit plus remonter telle quelle.
    expect(message).not.toMatch(/Unexpected token/);
  });
});
