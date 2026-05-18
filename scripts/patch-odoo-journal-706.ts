// Patch le default_account_id du journal de vente SOLUVIA (id=8) vers 706000.
// Verifie d'abord que 706000 existe dans la company SOLUVIA, puis applique.
// Run : npx tsx scripts/patch-odoo-journal-706.ts

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

const JOURNAL_ID = 8;
const COMPANY_ID = 1;
const TARGET_CODE = '706000';

async function main() {
  const url = process.env.ODOO_URL!;
  const db = process.env.ODOO_DB!;
  const username = process.env.ODOO_USERNAME!;
  const apiKey = process.env.ODOO_API_KEY!;

  const uid = await rpc<number>(url, 'common', 'authenticate', [
    db,
    username,
    apiKey,
    {},
  ]);
  console.log(`[odoo] auth uid=${uid}`);

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

  // 1. Lire l'etat actuel du journal
  type Journal = {
    id: number;
    name: string;
    code: string;
    company_id: [number, string];
    default_account_id: [number, string] | false;
  };
  const journals = await exec<Journal[]>(
    'account.journal',
    'read',
    [[JOURNAL_ID]],
    { fields: ['id', 'name', 'code', 'company_id', 'default_account_id'] },
  );
  const journal = journals[0];
  if (!journal) throw new Error(`Journal ${JOURNAL_ID} introuvable`);

  console.log(
    `[odoo] avant   journal ${journal.id} "${journal.name}" code=${journal.code}`,
  );
  console.log(
    `       company=${journal.company_id[0]} default_account=${
      journal.default_account_id
        ? journal.default_account_id[0] + ' ' + journal.default_account_id[1]
        : '(none)'
    }`,
  );

  // 2. Chercher 706000 dans la company SOLUVIA
  type Account = {
    id: number;
    code: string;
    name: string;
    account_type: string;
  };
  const accounts = await exec<Account[]>(
    'account.account',
    'search_read',
    [
      [
        ['code', '=', TARGET_CODE],
        ['company_ids', 'in', [COMPANY_ID]],
      ],
    ],
    { fields: ['id', 'code', 'name', 'account_type'], limit: 5 },
  );

  if (accounts.length === 0) {
    // Fallback : selon la version Odoo, le champ est company_id (singulier) ou company_ids
    const accountsAlt = await exec<Account[]>(
      'account.account',
      'search_read',
      [
        [
          ['code', '=', TARGET_CODE],
          ['company_id', '=', COMPANY_ID],
        ],
      ],
      { fields: ['id', 'code', 'name', 'account_type'], limit: 5 },
    );
    if (accountsAlt.length === 0) {
      console.error(
        `FAIL  compte ${TARGET_CODE} introuvable dans la company ${COMPANY_ID}.`,
      );
      console.error(
        '      Cree-le dans Odoo (Comptabilite > Configuration > Plan comptable)',
      );
      console.error(
        '      Type=Revenus, code=706000, libelle="Prestations de services".',
      );
      process.exit(1);
    }
    accounts.push(...accountsAlt);
  }

  const target = accounts[0]!;
  console.log(
    `[odoo] cible   compte ${target.id} code=${target.code} "${target.name}" type=${target.account_type}`,
  );

  if (
    journal.default_account_id &&
    journal.default_account_id[0] === target.id
  ) {
    console.log('OK   deja sur la cible, rien a faire.');
    return;
  }

  // 3. Patch
  const ok = await exec<boolean>('account.journal', 'write', [
    [JOURNAL_ID],
    { default_account_id: target.id },
  ]);
  if (!ok) throw new Error('write retourne false');

  // 4. Verifier
  const after = await exec<Journal[]>(
    'account.journal',
    'read',
    [[JOURNAL_ID]],
    { fields: ['id', 'default_account_id'] },
  );
  const newDefault = after[0]?.default_account_id;
  console.log(
    `[odoo] apres   default_account=${
      newDefault ? newDefault[0] + ' ' + newDefault[1] : '(none)'
    }`,
  );
  console.log('OK   journal patche.');
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
