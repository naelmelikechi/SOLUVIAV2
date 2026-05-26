/**
 * Liste tous les comptes analytiques cote Odoo (wisemanh).
 * Usage : npx tsx scripts/list-odoo-analytic-accounts.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.ODOO_URL!;
const DB = process.env.ODOO_DB!;
const USERNAME = process.env.ODOO_USERNAME!;
const API_KEY = process.env.ODOO_API_KEY!;

async function rpc<T>(
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Math.floor(Math.random() * 1_000_000),
    }),
  });
  const json = (await res.json()) as {
    result?: T;
    error?: { data?: { message?: string }; message?: string };
  };
  if (json.error) {
    throw new Error(
      json.error.data?.message || json.error.message || 'Odoo RPC error',
    );
  }
  return json.result as T;
}

async function main() {
  const uid = await rpc<number | false>('common', 'authenticate', [
    DB,
    USERNAME,
    API_KEY,
    {},
  ]);
  if (!uid) throw new Error('Authentication failed');

  const ids = await rpc<number[]>('object', 'execute_kw', [
    DB,
    uid,
    API_KEY,
    'account.analytic.account',
    'search',
    [[]],
    { limit: 500 },
  ]);

  if (ids.length === 0) {
    console.log('Aucun compte analytique trouve');
    return;
  }

  const records = await rpc<
    Array<{
      id: number;
      name: string;
      code: string | false;
      company_id: [number, string] | false;
      plan_id: [number, string] | false;
      active: boolean;
    }>
  >('object', 'execute_kw', [
    DB,
    uid,
    API_KEY,
    'account.analytic.account',
    'read',
    [ids],
    { fields: ['id', 'name', 'code', 'company_id', 'plan_id', 'active'] },
  ]);

  console.log(`\n=== ${records.length} comptes analytiques Odoo ===\n`);
  console.log(
    'ID'.padEnd(6),
    'CODE'.padEnd(20),
    'NAME'.padEnd(45),
    'COMPANY'.padEnd(15),
    'PLAN'.padEnd(20),
    'ACT',
  );
  console.log('-'.repeat(115));
  // Sort by company then by code
  records.sort((a, b) => {
    const ca = a.company_id ? a.company_id[1] : '';
    const cb = b.company_id ? b.company_id[1] : '';
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.code || '').localeCompare(b.code || '');
  });
  for (const r of records) {
    console.log(
      String(r.id).padEnd(6),
      (r.code || '-').padEnd(20),
      (r.name || '-').slice(0, 44).padEnd(45),
      (r.company_id ? r.company_id[1] : '-').slice(0, 14).padEnd(15),
      (r.plan_id ? r.plan_id[1] : '-').slice(0, 19).padEnd(20),
      r.active ? 'oui' : 'NON',
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exit(1);
});
