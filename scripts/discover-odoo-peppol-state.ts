// READ-ONLY : valeurs des statuts Peppol/EDI + etat d'activation reel des
// companies SOLUVIA/EDUVIA. Complement de discover-odoo-einvoicing.ts.
// Run : npx tsx scripts/discover-odoo-peppol-state.ts

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

  // Selection values pour les champs de statut/format
  const probes: Array<[string, string]> = [
    ['account.move', 'peppol_move_state'],
    ['res.partner', 'invoice_edi_format'],
    ['res.partner', 'peppol_verification_state'],
    ['res.company', 'account_peppol_proxy_state'],
  ];
  for (const [model, field] of probes) {
    const meta = await exec<Record<string, { selection?: [string, string][] }>>(
      model,
      'fields_get',
      [[field]],
      { attributes: ['selection'] },
    );
    const sel = meta[field]?.selection ?? [];
    console.log(`=== ${model}.${field} (valeurs possibles) ===`);
    for (const [k, v] of sel) console.log(`  ${String(k).padEnd(20)} ${v}`);
    console.log('');
  }

  // Etat d'activation Peppol reel des companies
  type Company = {
    id: number;
    name: string;
    account_peppol_proxy_state: string | false;
    peppol_can_send: boolean;
    peppol_eas: string | false;
    peppol_endpoint: string | false;
    l10n_fr_rof_type: number | false;
  };
  const companies = await exec<Company[]>('res.company', 'read', [[1, 2]], {
    fields: [
      'id',
      'name',
      'account_peppol_proxy_state',
      'peppol_can_send',
      'peppol_eas',
      'peppol_endpoint',
      'l10n_fr_rof_type',
    ],
  });
  console.log('=== ETAT PEPPOL DES COMPANIES ===');
  for (const c of companies) {
    console.log(`  [${c.id}] ${c.name}`);
    console.log(
      `      proxy_state   = ${c.account_peppol_proxy_state || '(non configure)'}`,
    );
    console.log(`      can_send      = ${c.peppol_can_send}`);
    console.log(`      eas           = ${c.peppol_eas || '-'}`);
    console.log(`      endpoint      = ${c.peppol_endpoint || '-'}`);
    console.log(`      l10n_fr_rof   = ${c.l10n_fr_rof_type || '-'}`);
  }
  console.log('\n[odoo] peppol-state discovery done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
