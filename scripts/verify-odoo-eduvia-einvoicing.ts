// READ-ONLY : verifie la configuration e-invoicing de la company EDUVIA [2].
// Parallele de verify-odoo-soluvia-einvoicing.ts. Aucune ecriture.
// Run : npx tsx scripts/verify-odoo-eduvia-einvoicing.ts

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
  if (json.error)
    throw new Error(json.error.data?.message ?? json.error.message);
  return json.result as T;
}

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

  const fields = [
    'id',
    'name',
    'vat',
    'company_registry',
    'country_id',
    'account_peppol_proxy_state',
    'peppol_can_send',
    'peppol_eas',
    'peppol_endpoint',
    'peppol_external_provider',
    'peppol_reception_mode',
    'account_peppol_contact_email',
    'account_peppol_edi_user',
  ];
  const [company] = await exec<Array<Record<string, unknown>>>(
    'res.company',
    'read',
    [[2]],
    { fields },
  );
  console.log('=== CONFIG E-INVOICING — COMPANY EDUVIA [2] ===\n');
  for (const f of fields) {
    const v = company?.[f];
    console.log(
      `  ${f.padEnd(30)} = ${v === false ? '(vide)' : JSON.stringify(v)}`,
    );
  }
  console.log('');

  const proxyIds = await exec<number[]>(
    'account_edi_proxy_client.user',
    'search',
    [[['company_id', '=', 2]]],
    {},
  );
  console.log(`=== EDI PROXY USER (company 2) : ${proxyIds.length} ===`);
  if (proxyIds.length > 0) {
    const proxies = await exec<
      Array<{
        id: number;
        proxy_type: string | false;
        edi_mode: string | false;
        edi_identification: string | false;
      }>
    >('account_edi_proxy_client.user', 'read', [proxyIds], {
      fields: ['id', 'proxy_type', 'edi_mode', 'edi_identification'],
    });
    for (const p of proxies) {
      console.log(
        `  [${p.id}] type=${p.proxy_type || '-'} mode=${p.edi_mode || '-'} ident=${p.edi_identification || '-'}`,
      );
    }
  } else {
    console.log('  (aucun proxy EDI -> EDUVIA non enregistree sur le reseau)');
  }

  console.log('\n[odoo] verification EDUVIA done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
