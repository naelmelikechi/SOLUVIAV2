// Decouverte READ-ONLY de la capacite e-invoicing de l'instance Odoo cible.
// Sonde : version serveur, modules de localisation FR / Factur-X / EDI / PDP
// installes, champs e-invoicing exposes sur account.move, et config des
// companies. Aucune ecriture (version / search_read / read / fields_get).
//
// Run : npx tsx scripts/discover-odoo-einvoicing.ts

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

// Mots-cles de modules lies a la facturation electronique francaise.
const MODULE_KEYWORDS = [
  'l10n_fr',
  'facturx',
  'factur_x',
  'factur-x',
  'edi',
  'peppol',
  'chorus',
  'einvoice',
  'e_invoice',
  'e-invoice',
  'ubl',
  'cii',
  'dematerial',
];

// Patterns de champs e-invoicing potentiels sur account.move.
const FIELD_PATTERNS =
  /(edi|facturx|factur_x|peppol|chorus|l10n_fr|ubl|cii|einvoice|e_invoice|dematerial|narration)/i;

async function main() {
  const url = process.env.ODOO_URL!;
  const db = process.env.ODOO_DB!;
  const username = process.env.ODOO_USERNAME!;
  const apiKey = process.env.ODOO_API_KEY!;

  if (!url || !db || !username || !apiKey) {
    throw new Error(
      'ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY manquants dans .env.local',
    );
  }

  console.log(`[odoo] connecting to ${url} db=${db}`);

  // 1. Version serveur
  const version = await rpc<{
    server_version: string;
    server_serie?: string;
  }>(url, 'common', 'version', []);
  console.log(`[odoo] server_version=${version.server_version}\n`);

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

  // 2. Modules installes pertinents
  type Module = {
    name: string;
    shortdesc: string;
    state: string;
    installed_version: string | false;
  };
  const allInstalled = await exec<Module[]>(
    'ir.module.module',
    'search_read',
    [[['state', 'in', ['installed', 'to upgrade']]]],
    { fields: ['name', 'shortdesc', 'state', 'installed_version'] },
  );
  const relevant = allInstalled.filter((m) =>
    MODULE_KEYWORDS.some((k) => m.name.toLowerCase().includes(k)),
  );
  console.log(
    `=== MODULES E-INVOICING INSTALLES (${relevant.length} / ${allInstalled.length} total) ===`,
  );
  if (relevant.length === 0) {
    console.log('  (aucun module de localisation FR / Factur-X / EDI detecte)');
  }
  for (const m of relevant.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(
      `  ${m.name.padEnd(36)} ${String(m.installed_version || '').padEnd(12)} ${m.state}  | ${m.shortdesc}`,
    );
  }
  console.log('');

  // 3. Champs e-invoicing sur account.move
  const moveFields = await exec<
    Record<string, { string: string; type: string }>
  >('account.move', 'fields_get', [], {
    attributes: ['string', 'type'],
  });
  const matchingMoveFields = Object.entries(moveFields)
    .filter(([name]) => FIELD_PATTERNS.test(name))
    .sort(([a], [b]) => a.localeCompare(b));
  console.log(
    `=== CHAMPS account.move lies e-invoicing (${matchingMoveFields.length}) ===`,
  );
  for (const [name, meta] of matchingMoveFields) {
    console.log(`  ${name.padEnd(40)} ${meta.type.padEnd(12)} ${meta.string}`);
  }
  console.log('');

  // 4. Champs e-invoicing sur res.company + res.partner (config fiscale)
  for (const model of ['res.company', 'res.partner']) {
    const fields = await exec<Record<string, { string: string; type: string }>>(
      model,
      'fields_get',
      [],
      { attributes: ['string', 'type'] },
    );
    const matching = Object.entries(fields)
      .filter(([name]) =>
        /(l10n_fr|edi|peppol|chorus|facturx|siren|siret|ubl|einvoice|e_invoice)/i.test(
          name,
        ),
      )
      .sort(([a], [b]) => a.localeCompare(b));
    console.log(
      `=== CHAMPS ${model} lies e-invoicing (${matching.length}) ===`,
    );
    for (const [name, meta] of matching) {
      console.log(
        `  ${name.padEnd(40)} ${meta.type.padEnd(12)} ${meta.string}`,
      );
    }
    console.log('');
  }

  // 5. Companies + fiscal country
  type Company = {
    id: number;
    name: string;
    country_id: [number, string] | false;
    currency_id: [number, string] | false;
    vat: string | false;
  };
  const companies = await exec<Company[]>('res.company', 'search_read', [[]], {
    fields: ['id', 'name', 'country_id', 'currency_id', 'vat'],
  });
  console.log(`=== COMPANIES (${companies.length}) ===`);
  for (const c of companies) {
    const country =
      typeof c.country_id !== 'boolean' ? c.country_id[1] : '(none)';
    console.log(
      `  [${c.id}] ${c.name.padEnd(24)} pays=${country} vat=${c.vat || '-'}`,
    );
  }
  console.log('');

  console.log('[odoo] discovery done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
