// Inspection one-shot : liste les factures et avoirs SOLUVIA presents dans Odoo.
// Run : npx tsx scripts/inspect-odoo-invoices.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

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
  console.log(`[odoo] authenticated uid=${uid}\n`);

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

  type Move = {
    id: number;
    ref: string | false;
    name: string;
    state: string;
    move_type: string;
    invoice_date: string | false;
    amount_total: number;
    partner_id: [number, string] | false;
  };

  const moves = await exec<Move[]>(
    'account.move',
    'search_read',
    [
      [
        ['move_type', 'in', ['out_invoice', 'out_refund']],
        ['ref', 'like', 'FAC-'],
      ],
    ],
    {
      fields: [
        'id',
        'ref',
        'name',
        'state',
        'move_type',
        'invoice_date',
        'amount_total',
        'partner_id',
      ],
      order: 'invoice_date desc, id desc',
    },
  );

  console.log(
    `[odoo] found ${moves.length} SOLUVIA moves (ref LIKE 'FAC-%')\n`,
  );

  // Group by trigramme (FAC-XXX-)
  const byTrigramme = new Map<string, Move[]>();
  for (const m of moves) {
    const refStr = typeof m.ref === 'string' ? m.ref : '(no ref)';
    const trigramme = refStr.match(/^FAC-([A-Z]+)-/)?.[1] ?? 'OTHER';
    if (!byTrigramme.has(trigramme)) byTrigramme.set(trigramme, []);
    byTrigramme.get(trigramme)!.push(m);
  }

  const sortedTrigrammes = [...byTrigramme.keys()].sort();
  for (const trig of sortedTrigrammes) {
    const list = byTrigramme.get(trig)!;
    console.log(`=== ${trig} (${list.length}) ===`);
    for (const m of list) {
      const refStr = typeof m.ref === 'string' ? m.ref : '(no ref)';
      const partner =
        typeof m.partner_id !== 'boolean' ? m.partner_id[1] : '(no partner)';
      const date = typeof m.invoice_date === 'string' ? m.invoice_date : '?';
      console.log(
        `  ${refStr.padEnd(15)} ${m.move_type.padEnd(11)} ${m.state.padEnd(8)} ${date} ${String(
          m.amount_total,
        ).padStart(10)} € | ${partner}`,
      );
    }
    console.log('');
  }

  // Summary
  const byState = new Map<string, number>();
  for (const m of moves) {
    byState.set(m.state, (byState.get(m.state) ?? 0) + 1);
  }
  console.log('=== SUMMARY BY STATE ===');
  for (const [state, count] of byState) {
    console.log(`  ${state}: ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
