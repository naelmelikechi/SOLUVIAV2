// Pre-flight Odoo avant emission des premieres factures HEOL.
// Verifie : auth, taxe 20% sale, journal de vente, partner HEOL (existant ou pas),
// configuration receivable account du partner si trouve, et ref-collision Odoo.
// Run : npx tsx scripts/preflight-odoo-heol.ts

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

const HEOL = {
  raison_sociale: 'HEOL ACADEMY',
  siret: '92255939800032',
  vat: 'FR01922559398',
};

const PLANNED_REFS = ['FAC-HEO-0001', 'FAC-HEO-0002'];

async function main() {
  const url = process.env.ODOO_URL!;
  const db = process.env.ODOO_DB!;
  const username = process.env.ODOO_USERNAME!;
  const apiKey = process.env.ODOO_API_KEY!;

  if (!url || !db || !username || !apiKey) {
    console.error(
      'Missing ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY in .env.local',
    );
    process.exit(1);
  }

  console.log(`\n=== PRE-FLIGHT ODOO (target: ${url}, db=${db}) ===\n`);

  // 1. Auth
  const uid = await rpc<number>(url, 'common', 'authenticate', [
    db,
    username,
    apiKey,
    {},
  ]);
  if (!uid || typeof uid !== 'number') {
    console.error('FAIL: authentication failed');
    process.exit(1);
  }
  const versionInfo = await rpc<{
    server_version?: string;
    server_serie?: string;
  }>(url, 'common', 'version', []);
  console.log(
    `OK  auth                uid=${uid}, version=${versionInfo.server_version ?? versionInfo.server_serie}`,
  );

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

  let failures = 0;

  // 2. Taxe 20% sale
  type Tax = { id: number; name: string; amount: number; type_tax_use: string };
  const taxes = await exec<Tax[]>(
    'account.tax',
    'search_read',
    [
      [
        ['type_tax_use', '=', 'sale'],
        ['amount', '=', 20],
        ['amount_type', '=', 'percent'],
      ],
    ],
    { fields: ['id', 'name', 'amount', 'type_tax_use'], limit: 5 },
  );
  if (taxes.length === 0) {
    console.error(
      'FAIL taxe 20% sale       aucune taxe trouvee -> Configuration > Taxes',
    );
    failures++;
  } else {
    console.log(
      `OK  taxe 20% sale        id=${taxes[0]!.id} "${taxes[0]!.name}"`,
    );
  }

  // 3. Journal de vente actif
  type Journal = {
    id: number;
    name: string;
    code: string;
    type: string;
    active: boolean;
    default_account_id: [number, string] | false;
  };
  const journals = await exec<Journal[]>(
    'account.journal',
    'search_read',
    [
      [
        ['type', '=', 'sale'],
        ['active', '=', true],
      ],
    ],
    {
      fields: ['id', 'name', 'code', 'type', 'active', 'default_account_id'],
      limit: 5,
    },
  );
  if (journals.length === 0) {
    console.error('FAIL journal de vente    aucun journal sale actif');
    failures++;
  } else {
    for (const j of journals) {
      const acc = j.default_account_id
        ? `${j.default_account_id[0]} ${j.default_account_id[1]}`
        : '(no default account)';
      console.log(
        `OK  journal vente        id=${j.id} code=${j.code} "${j.name}" default_account=${acc}`,
      );
    }
  }

  // 4. Partner HEOL : match strict VAT puis SIRET (meme logique que lib/odoo/client.ts)
  type Partner = {
    id: number;
    name: string;
    vat: string | false;
    company_registry: string | false;
    property_account_receivable_id: [number, string] | false;
    property_account_payable_id: [number, string] | false;
  };
  const partnerFields = [
    'id',
    'name',
    'vat',
    'company_registry',
    'property_account_receivable_id',
    'property_account_payable_id',
  ];
  let heol: Partner | undefined;
  const byVat = await exec<Partner[]>(
    'res.partner',
    'search_read',
    [[['vat', '=', HEOL.vat]]],
    { fields: partnerFields, limit: 1 },
  );
  if (byVat[0]) heol = byVat[0];
  if (!heol) {
    const bySiret = await exec<Partner[]>(
      'res.partner',
      'search_read',
      [[['company_registry', '=', HEOL.siret]]],
      { fields: partnerFields, limit: 1 },
    );
    if (bySiret[0]) heol = bySiret[0];
  }
  if (!heol) {
    console.log(
      `INFO partner HEOL        absent dans Odoo -> sera cree au 1er push (name="${HEOL.raison_sociale}", vat=${HEOL.vat}, siret=${HEOL.siret})`,
    );
    console.log(
      `     A surveiller : property_account_receivable_id (411) sera assigne par defaut Odoo`,
    );
  } else {
    const rec = heol.property_account_receivable_id
      ? `${heol.property_account_receivable_id[0]} ${heol.property_account_receivable_id[1]}`
      : '(none)';
    console.log(
      `OK  partner HEOL         id=${heol.id} name="${heol.name}" vat=${heol.vat || '-'} siret=${heol.company_registry || '-'}`,
    );
    console.log(`    receivable account   ${rec}`);
    if (!heol.property_account_receivable_id) {
      console.error(
        'FAIL                     pas de compte 411 assigne sur le partner -> Odoo refusera action_post',
      );
      failures++;
    }
  }

  // 4b. Multi-company : verifier la company active de l API user + ses defaults.
  // 5 journaux "Sales" suggere un setup multi-company. Odoo affecte la facture
  // a la company de l'utilisateur connecte si journal_id n'est pas specifie
  // dans le payload (notre cas).
  type ResUsers = {
    id: number;
    name: string;
    login: string;
    company_id: [number, string] | false;
    company_ids: number[];
  };
  const meRows = await exec<ResUsers[]>('res.users', 'read', [[uid]], {
    fields: ['id', 'name', 'login', 'company_id', 'company_ids'],
  });
  const me = meRows[0];
  if (!me?.company_id) {
    console.error(
      'FAIL api user company    impossible de determiner la company de l API user',
    );
    failures++;
  } else {
    const [companyId, companyName] = me.company_id;
    console.log(
      `OK  api user company     id=${companyId} "${companyName}" (uid=${uid} ${me.login})`,
    );
    if (me.company_ids.length > 1) {
      console.log(
        `INFO multi-company       l'utilisateur a acces a ${me.company_ids.length} companies (ids=${me.company_ids.join(',')})`,
      );
    }

    // Journal actif pour CETTE company
    const companyJournals = await exec<Journal[]>(
      'account.journal',
      'search_read',
      [
        [
          ['type', '=', 'sale'],
          ['active', '=', true],
          ['company_id', '=', companyId],
        ],
      ],
      { fields: ['id', 'name', 'code', 'default_account_id'], limit: 5 },
    );
    if (companyJournals.length === 0) {
      console.error(
        `FAIL journal target      aucun journal sale pour company ${companyId} -> la facture sera en erreur`,
      );
      failures++;
    } else {
      for (const j of companyJournals) {
        const acc = j.default_account_id
          ? `${j.default_account_id[0]} ${j.default_account_id[1]}`
          : '(none)';
        console.log(
          `OK  journal target       id=${j.id} code=${j.code} default_account=${acc}  <- SERA UTILISE`,
        );
      }
    }

    // Taxe 20% pour cette company
    const companyTaxes = await exec<Tax[]>(
      'account.tax',
      'search_read',
      [
        [
          ['type_tax_use', '=', 'sale'],
          ['amount', '=', 20],
          ['amount_type', '=', 'percent'],
          ['company_id', '=', companyId],
        ],
      ],
      { fields: ['id', 'name'], limit: 3 },
    );
    if (companyTaxes.length === 0) {
      console.error(
        `FAIL taxe 20% company    aucune taxe 20% sale pour company ${companyId} (la taxe 30 globale ne sera pas appliquable)`,
      );
      failures++;
    } else {
      console.log(
        `OK  taxe 20% company     id=${companyTaxes[0]!.id} "${companyTaxes[0]!.name}" pour company ${companyId}`,
      );
    }

    // Verifier le chart_template configure pour cette company (Odoo 17+)
    type ResCompany = {
      id: number;
      name: string;
      chart_template: string | false;
      account_sale_tax_id: [number, string] | false;
      account_default_pos_receivable_account_id: [number, string] | false;
    };
    try {
      const companyRows = await exec<ResCompany[]>(
        'res.company',
        'read',
        [[companyId]],
        { fields: ['id', 'name', 'chart_template', 'account_sale_tax_id'] },
      );
      const co = companyRows[0];
      if (co) {
        console.log(
          `OK  chart_template       company "${co.name}" template="${co.chart_template || '(none)'}"`,
        );
        if (co.account_sale_tax_id) {
          console.log(
            `OK  default sale tax     company tax default=${co.account_sale_tax_id[0]} "${co.account_sale_tax_id[1]}"`,
          );
        }
      }
    } catch (e) {
      console.log(
        `INFO chart_template      lookup skipped (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  // 5. Collision ref : verifier qu aucun account.move out_invoice n existe deja
  //    pour FAC-HEO-0001 / FAC-HEO-0002 (sinon le push les reuserait silencieusement).
  type Move = {
    id: number;
    ref: string | false;
    move_type: string;
    state: string;
  };
  const collisions = await exec<Move[]>(
    'account.move',
    'search_read',
    [
      [
        ['ref', 'in', PLANNED_REFS],
        ['move_type', 'in', ['out_invoice', 'out_refund']],
      ],
    ],
    { fields: ['id', 'ref', 'move_type', 'state'], limit: 10 },
  );
  if (collisions.length > 0) {
    console.error(
      `FAIL collision ref       ${collisions.length} move(s) Odoo deja sur ${PLANNED_REFS.join(',')}`,
    );
    for (const c of collisions) {
      console.error(
        `     id=${c.id} ref="${c.ref}" type=${c.move_type} state=${c.state}`,
      );
    }
    failures++;
  } else {
    console.log(
      `OK  refs libres          ${PLANNED_REFS.join(', ')} dispo cote Odoo`,
    );
  }

  // 6. Existing HEOLDEMO / drafts a nettoyer ?
  const heoldemoDrafts = await exec<Move[]>(
    'account.move',
    'search_read',
    [
      [
        ['ref', 'ilike', 'FAC-HED-'],
        ['state', '=', 'draft'],
      ],
    ],
    { fields: ['id', 'ref', 'move_type', 'state'], limit: 10 },
  );
  if (heoldemoDrafts.length > 0) {
    console.log(
      `INFO HEOLDEMO drafts     ${heoldemoDrafts.length} draft(s) FAC-HED-* (demo) cote Odoo - pas bloquant`,
    );
  }

  console.log('');
  if (failures > 0) {
    console.error(
      `=== ${failures} FAIL(S) — ne pas envoyer tant que pas resolu ===`,
    );
    process.exit(1);
  }
  console.log('=== Pre-flight OK — pret a envoyer ===');
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
