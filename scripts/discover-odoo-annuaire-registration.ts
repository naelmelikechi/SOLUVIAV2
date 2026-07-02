// READ-ONLY : cherche tout ce qui touche a l'inscription a l'annuaire / la
// publication de la company SOLUVIA cote Odoo (Peppol SMP, directory, registration).
// But : identifier l'etape manquante pour que l'annuaire Chorus Pro affiche
// "plateforme agreee rattachee = Oui". Aucune ecriture.
// Run : npx tsx scripts/discover-odoo-annuaire-registration.ts

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

  // 1. Tous les champs res.company qui touchent registration/directory/annuaire/smp.
  const compFields = await exec<
    Record<string, { string: string; type: string }>
  >('res.company', 'fields_get', [], { attributes: ['string', 'type'] });
  const compMatch = Object.entries(compFields)
    .filter(([n]) =>
      /(register|registr|directory|annuaire|smp|sml|published|publish|ppf|chorus|reception|proxy|peppol)/i.test(
        n,
      ),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  const compFieldNames = compMatch.map(([n]) => n);
  const [company] = await exec<Array<Record<string, unknown>>>(
    'res.company',
    'read',
    [[1]],
    { fields: compFieldNames },
  );
  console.log('=== res.company [SOLUVIA] champs registration/directory ===');
  for (const [n, meta] of compMatch) {
    const v = company?.[n];
    console.log(
      `  ${n.padEnd(38)} (${meta.type}) = ${v === false ? '(vide)' : JSON.stringify(v)}`,
    );
  }
  console.log('');

  // 2. Le proxy user EDI (lien concret avec l'access point) : tous ses champs.
  const proxyIds = await exec<number[]>(
    'account_edi_proxy_client.user',
    'search',
    [[['company_id', '=', 1]]],
    {},
  );
  if (proxyIds.length > 0) {
    const pf = await exec<Record<string, { string: string; type: string }>>(
      'account_edi_proxy_client.user',
      'fields_get',
      [],
      { attributes: ['string', 'type'] },
    );
    const names = Object.keys(pf).filter(
      (n) => !['create_uid', 'write_uid', '__last_update'].includes(n),
    );
    const [pu] = await exec<Array<Record<string, unknown>>>(
      'account_edi_proxy_client.user',
      'read',
      [proxyIds],
      { fields: names },
    );
    console.log('=== account_edi_proxy_client.user [company 1] ===');
    for (const n of names.sort()) {
      const v = pu?.[n];
      if (v === false || v === '' || v === null) continue;
      console.log(`  ${n.padEnd(30)} = ${JSON.stringify(v)}`);
    }
    console.log('');
  }

  // 3. Existe-t-il un modele dedie a l'annuaire / registration FR ?
  const models = await exec<Array<{ model: string; name: string }>>(
    'ir.model',
    'search_read',
    [
      [
        '|',
        '|',
        ['model', 'ilike', 'peppol'],
        ['model', 'ilike', 'edi_proxy'],
        ['model', 'ilike', 'l10n_fr'],
      ],
    ],
    { fields: ['model', 'name'] },
  );
  console.log('=== modeles Odoo lies peppol/edi_proxy/l10n_fr ===');
  for (const m of models.sort((a, b) => a.model.localeCompare(b.model))) {
    console.log(`  ${m.model.padEnd(40)} ${m.name}`);
  }

  console.log('\n[odoo] annuaire-registration discovery done (read-only).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
