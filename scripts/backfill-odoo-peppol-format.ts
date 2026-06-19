// Backfill one-shot : pose invoice_edi_format='facturx' sur les partners clients
// FR ayant un SIRET (company_registry) et un invoice_edi_format vide. N'ecrase
// jamais une valeur existante. Dry-run par defaut ; ecrit seulement avec --apply.
//
// Run (dry-run) : npx tsx scripts/backfill-odoo-peppol-format.ts
// Run (apply)   : npx tsx scripts/backfill-odoo-peppol-format.ts --apply

import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  EDI_FORMAT_FACTURX,
  resolveInvoiceEdiFormat,
} from '../lib/odoo/invoice-edi-format';

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
  const apply = process.argv.includes('--apply');
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

  type Partner = {
    id: number;
    name: string;
    company_registry: string | false;
    invoice_edi_format: string | false;
  };
  const partners = await exec<Partner[]>(
    'res.partner',
    'search_read',
    [
      [
        ['customer_rank', '>', 0],
        ['country_id.code', '=', 'FR'],
        ['company_registry', '!=', false],
        ['invoice_edi_format', '=', false],
      ],
    ],
    { fields: ['id', 'name', 'company_registry', 'invoice_edi_format'] },
  );

  const targets = partners.filter(
    (p) =>
      resolveInvoiceEdiFormat({
        countryCode: 'FR',
        companyRegistry:
          typeof p.company_registry === 'string' ? p.company_registry : '',
      }) === EDI_FORMAT_FACTURX,
  );

  console.log(
    `[odoo] ${targets.length} partner(s) client(s) FR sans invoice_edi_format`,
  );
  for (const p of targets) {
    console.log(`  [${p.id}] ${p.name} (registry=${p.company_registry})`);
  }

  if (!apply) {
    console.log(
      '\n[dry-run] aucun changement. Relancer avec --apply pour ecrire.',
    );
    return;
  }

  let written = 0;
  for (const p of targets) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop
    await exec<boolean>('res.partner', 'write', [
      [p.id],
      { invoice_edi_format: EDI_FORMAT_FACTURX },
    ]);
    written++;
  }
  console.log(
    `\n[apply] invoice_edi_format='facturx' pose sur ${written} partner(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
