// READ-ONLY : verifie la configuration e-invoicing de la company SOLUVIA [1].
// Sonde l'etat Peppol, le provider/PDP utilise, les identifiants de routage et
// la completude des donnees fiscales. Aucune ecriture.
// Run : npx tsx scripts/verify-odoo-soluvia-einvoicing.ts

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

  // Company SOLUVIA = id 1 (cf decouverte). Lecture large des champs Peppol/EDI.
  const companyFields = [
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
    'peppol_purchase_journal_id',
    'account_peppol_contact_email',
    'account_peppol_edi_user',
    'l10n_fr_rof_type',
  ];
  const [company] = await exec<Array<Record<string, unknown>>>(
    'res.company',
    'read',
    [[1]],
    { fields: companyFields },
  );

  console.log('=== CONFIG E-INVOICING — COMPANY SOLUVIA [1] ===\n');
  for (const f of companyFields) {
    const v = company?.[f];
    console.log(
      `  ${f.padEnd(30)} = ${v === false ? '(vide)' : JSON.stringify(v)}`,
    );
  }
  console.log('');

  // EDI proxy clients de la company (le lien concret vers l'access point/PDP).
  type ProxyClient = {
    id: number;
    proxy_type: string | false;
    edi_mode: string | false;
    edi_identification: string | false;
  };
  const proxyIds = await exec<number[]>(
    'account_edi_proxy_client.user',
    'search',
    [[['company_id', '=', 1]]],
    {},
  );
  console.log(
    `=== ACCOUNT_EDI_PROXY_CLIENT.USER (company 1) : ${proxyIds.length} ===`,
  );
  if (proxyIds.length > 0) {
    const proxies = await exec<ProxyClient[]>(
      'account_edi_proxy_client.user',
      'read',
      [proxyIds],
      { fields: ['id', 'proxy_type', 'edi_mode', 'edi_identification'] },
    );
    for (const p of proxies) {
      console.log(
        `  [${p.id}] type=${p.proxy_type || '-'} mode=${p.edi_mode || '-'} ident=${p.edi_identification || '-'}`,
      );
    }
  }
  console.log('');

  // Combien de factures SOLUVIA postees ont deja un statut Peppol ?
  const moves = await exec<Array<{ peppol_move_state: string | false }>>(
    'account.move',
    'search_read',
    [
      [
        ['company_id', '=', 1],
        ['move_type', 'in', ['out_invoice', 'out_refund']],
        ['state', '=', 'posted'],
      ],
    ],
    { fields: ['peppol_move_state'], limit: 500 },
  );
  const byState = new Map<string, number>();
  for (const m of moves) {
    const k = m.peppol_move_state || '(vide)';
    byState.set(k, (byState.get(k) ?? 0) + 1);
  }
  console.log(
    `=== STATUT PEPPOL DES FACTURES SOLUVIA POSTEES (${moves.length}) ===`,
  );
  for (const [k, n] of [...byState.entries()].sort()) {
    console.log(`  ${k.padEnd(14)} ${n}`);
  }

  console.log('\n[odoo] verification SOLUVIA done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
