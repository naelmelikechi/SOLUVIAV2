// Cleanup one-shot : annule les factures et avoirs poussees pendant le
// smoke-test du 2026-05-04 dans Odoo prod. Les ref SOLUVIA correspondantes
// sont FAC-DUP-0003, FAC-DUP-0004, FAC-HEO-0002, FAC-HEO-0005, FAC-DUP-0006.
// Cherche aussi les drafts orphelins par ref pour les supprimer.
//
// Run : npx tsx scripts/cleanup-odoo-test-invoices.ts
// Pre-requis : .env.local avec ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

const TEST_REFS = [
  'FAC-DUP-0003',
  'FAC-DUP-0004',
  'FAC-HEO-0002',
  'FAC-HEO-0005',
  'FAC-DUP-0006',
];

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string; debug?: string } };
}

async function rpc<T>(
  url: string,
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(json.error.data?.message ?? json.error.message);
  }
  return json.result as T;
}

async function main() {
  const url = process.env.ODOO_URL!;
  const db = process.env.ODOO_DB!;
  const username = process.env.ODOO_USERNAME!;
  const apiKey = process.env.ODOO_API_KEY!;

  console.log(`[odoo] connecting to ${url} db=${db}`);
  const uid = await rpc<number>(url, 'common', 'authenticate', [
    db,
    username,
    apiKey,
    {},
  ]);
  console.log(`[odoo] authenticated uid=${uid}`);

  const exec = <T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ) =>
    rpc<T>(url, 'object', 'execute_kw', [
      db,
      uid,
      apiKey,
      model,
      method,
      args,
      kwargs,
    ]);

  // Cherche TOUTES les moves (incluant drafts) avec ref correspondante
  const moves = await exec<
    Array<{
      id: number;
      ref: string;
      state: string;
      move_type: string;
      name: string;
    }>
  >('account.move', 'search_read', [[['ref', 'in', TEST_REFS]]], {
    fields: ['id', 'ref', 'state', 'move_type', 'name'],
  });

  console.log(`\n[odoo] found ${moves.length} moves matching test refs:`);
  for (const m of moves) {
    console.log(
      `  - id=${m.id} ref=${m.ref} type=${m.move_type} state=${m.state} name=${m.name}`,
    );
  }

  if (moves.length === 0) {
    console.log('\n[odoo] nothing to cleanup');
    return;
  }

  // Strategie :
  // - state='draft' : unlink (suppression)
  // - state='posted' : button_cancel (annulation, garde la trace en compta)
  // - state='cancel' : deja annule, skip
  for (const m of moves) {
    try {
      if (m.state === 'draft') {
        console.log(`\n[odoo] unlink draft id=${m.id} ref=${m.ref}`);
        await exec<boolean>('account.move', 'unlink', [[m.id]]);
      } else if (m.state === 'posted') {
        console.log(`\n[odoo] cancel posted id=${m.id} ref=${m.ref}`);
        await exec<boolean>('account.move', 'button_cancel', [[m.id]]);
      } else {
        console.log(`\n[odoo] skip id=${m.id} ref=${m.ref} state=${m.state}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[odoo] FAILED on id=${m.id}: ${msg}`);
    }
  }

  console.log('\n[odoo] cleanup done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
