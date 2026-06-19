// READ-ONLY : etat des champs e-invoicing sur un echantillon de partners clients
// (ceux a qui SOLUVIA a deja pousse des factures). Confirme si Odoo auto-derive
// peppol_eas/endpoint depuis le SIRET, et quel champ porte le SIRET.
// Run : npx tsx scripts/discover-odoo-partner-peppol.ts

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

  // Quels champs "registry/siret" existent sur res.partner ?
  const pf = await exec<Record<string, { string: string; type: string }>>(
    'res.partner',
    'fields_get',
    [],
    { attributes: ['string', 'type'] },
  );
  const idFields = Object.keys(pf).filter((n) =>
    /(siret|siren|company_registry|vat)/i.test(n),
  );
  console.log('=== champs identifiants res.partner ===');
  for (const n of idFields.sort()) {
    const meta = pf[n];
    if (!meta) continue;
    console.log(`  ${n.padEnd(24)} ${meta.type.padEnd(10)} ${meta.string}`);
  }
  console.log('');

  // Echantillon de partners clients (rang_credit > 0 ou customer). On prend
  // ceux qui ont au moins une facture client.
  const readFields = [
    'id',
    'name',
    'country_id',
    'vat',
    ...(idFields.includes('siret') ? ['siret'] : []),
    ...(idFields.includes('company_registry') ? ['company_registry'] : []),
    'peppol_eas',
    'peppol_endpoint',
    'invoice_edi_format',
    'peppol_verification_state',
  ];
  const partners = await exec<Array<Record<string, unknown>>>(
    'res.partner',
    'search_read',
    [[['customer_rank', '>', 0]]],
    { fields: readFields, limit: 12, order: 'id desc' },
  );
  console.log(`=== ${partners.length} partners clients (customer_rank>0) ===`);
  for (const p of partners) {
    console.log(`  [${p.id}] ${String(p.name)}`);
    console.log(
      `      country=${JSON.stringify(p.country_id)} vat=${p.vat || '-'} ` +
        `siret=${p.siret ?? '-'} registry=${p.company_registry ?? '-'}`,
    );
    console.log(
      `      eas=${p.peppol_eas || '-'} endpoint=${p.peppol_endpoint || '-'} ` +
        `edi_format=${p.invoice_edi_format || '-'} verif=${p.peppol_verification_state || '-'}`,
    );
  }
  console.log('\n[odoo] partner peppol discovery done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
