// Cleanup one-shot : supprime les 3 factures draft HEOLDEMO (FAC-HED-0001/2/3)
// et le partner HEOLDEMO cote Odoo.
// Run : npx tsx scripts/cleanup-odoo-heoldemo.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

const TARGET_REFS = ['FAC-HED-0001', 'FAC-HED-0002', 'FAC-HED-0003'];
const PARTNER_NAME = 'HEOLDEMO';

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

  // Garde-fou destructif : ce script supprime des account.move et un partner.
  // S'il tourne contre un Odoo prod par accident (mauvais .env.local pointant
  // sur la base HEOL prod), il peut effacer des factures legales.
  // Exiger explicitement un marqueur 'demo' ou 'staging' dans ODOO_DB, ou la
  // variable CONFIRM_DESTRUCTIVE=YES pour bypass (cas d'un nom de DB sans
  // marqueur evident).
  const dbLower = db?.toLowerCase() ?? '';
  const looksSafe =
    dbLower.includes('demo') ||
    dbLower.includes('staging') ||
    dbLower.includes('test');
  const bypass = process.env.CONFIRM_DESTRUCTIVE === 'YES';
  if (!looksSafe && !bypass) {
    console.error(
      `[odoo] ABORT: ODOO_DB="${db}" ne contient pas 'demo'/'staging'/'test'.\n` +
        `Ce script supprime account.move et res.partner cote Odoo.\n` +
        `Si tu veux vraiment continuer, relance avec CONFIRM_DESTRUCTIVE=YES.`,
    );
    process.exit(2);
  }

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

  // 1. Supprimer les moves drafts HEOLDEMO
  type Move = {
    id: number;
    ref: string | false;
    state: string;
    move_type: string;
  };
  const moves = await exec<Move[]>(
    'account.move',
    'search_read',
    [[['ref', 'in', TARGET_REFS]]],
    { fields: ['id', 'ref', 'state', 'move_type'] },
  );

  console.log(`[odoo] found ${moves.length} moves to clean:`);
  for (const m of moves) {
    console.log(
      `  - id=${m.id} ref=${m.ref} type=${m.move_type} state=${m.state}`,
    );
  }

  for (const m of moves) {
    try {
      if (m.state === 'draft') {
        await exec<boolean>('account.move', 'unlink', [[m.id]]);
        console.log(`[odoo] unlinked draft ${m.ref} (id=${m.id})`);
      } else if (m.state === 'posted') {
        await exec<boolean>('account.move', 'button_cancel', [[m.id]]);
        console.log(`[odoo] cancelled posted ${m.ref} (id=${m.id})`);
      } else {
        console.log(`[odoo] skip ${m.ref} state=${m.state}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[odoo] FAILED on ${m.ref}: ${msg}`);
    }
  }

  // 2. Supprimer le partner HEOLDEMO
  console.log('');
  type Partner = { id: number; name: string; vat: string | false };
  const partners = await exec<Partner[]>(
    'res.partner',
    'search_read',
    [[['name', '=', PARTNER_NAME]]],
    { fields: ['id', 'name', 'vat'] },
  );

  console.log(
    `[odoo] found ${partners.length} partner(s) named ${PARTNER_NAME}:`,
  );
  for (const p of partners) {
    console.log(`  - id=${p.id} name=${p.name} vat=${p.vat || '(none)'}`);
  }

  for (const p of partners) {
    try {
      await exec<boolean>('res.partner', 'unlink', [[p.id]]);
      console.log(`[odoo] unlinked partner ${p.name} (id=${p.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[odoo] FAILED to unlink partner id=${p.id}: ${msg}`);
    }
  }

  console.log('\n[odoo] cleanup done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
