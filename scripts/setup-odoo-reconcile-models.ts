// Crée ou met à jour un `account.reconcile.model` Odoo par société émettrice
// (FAC-SOL-*, FAC-EDU-*, FAC-HEO-*, etc.). Permet à la compta de matcher
// automatiquement une bank.statement.line sur la bonne facture ouverte du
// bon journal/société sans saisie manuelle.
//
// Ref: mémoire `project_odoo_reconcile.md` (reconcile.model id=7 pour HEOL).
// Pattern réutilisable : un model par société, match par regex sur payment_ref.
//
// Usage:
//   npx tsx scripts/setup-odoo-reconcile-models.ts            # dry-run, n'écrit rien
//   npx tsx scripts/setup-odoo-reconcile-models.ts --apply    # crée/met à jour réellement
//
// Pré-requis : ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY +
//              NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local.

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string; debug?: string } };
}

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;
const APPLY = process.argv.includes('--apply');

async function rpc<T>(
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
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

let uid: number | null = null;
async function executeKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  if (uid === null) {
    uid = await rpc<number>('common', 'authenticate', [
      ODOO_DB,
      ODOO_USERNAME,
      ODOO_API_KEY,
      {},
    ]);
    if (!uid) throw new Error('Auth Odoo échouée');
  }
  return rpc<T>('object', 'execute_kw', [
    ODOO_DB,
    uid,
    ODOO_API_KEY,
    model,
    method,
    args,
    kwargs,
  ]);
}

interface Societe {
  id: string;
  code: string;
  raison_sociale: string;
  odoo_company_id: number | null;
  odoo_journal_id: number | null;
  actif: boolean;
}

async function loadSocietes(): Promise<Societe[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant',
    );
  }
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from('societes_emettrices')
    .select('id, code, raison_sociale, odoo_company_id, odoo_journal_id, actif')
    .eq('actif', true);
  if (error) throw new Error(`load societes: ${error.message}`);
  return (data ?? []) as Societe[];
}

interface ReconcileModel {
  id: number;
  name: string;
  company_id: [number, string] | false;
}

async function findReconcileModelByName(
  name: string,
  companyId: number,
): Promise<ReconcileModel | null> {
  const results = await executeKw<ReconcileModel[]>(
    'account.reconcile.model',
    'search_read',
    [
      [
        ['name', '=', name],
        ['company_id', '=', companyId],
      ],
    ],
    { fields: ['id', 'name', 'company_id'], limit: 1 },
  );
  return results[0] ?? null;
}

interface UpsertResult {
  societe: string;
  code: string;
  action:
    | 'created'
    | 'updated'
    | 'skipped'
    | 'dry-run-create'
    | 'dry-run-update'
    | 'error';
  odoo_id?: number;
  detail?: string;
}

async function upsertReconcileModelForSociete(
  s: Societe,
): Promise<UpsertResult> {
  if (!s.odoo_company_id) {
    return {
      societe: s.raison_sociale,
      code: s.code,
      action: 'skipped',
      detail: 'odoo_company_id NULL',
    };
  }

  const name = `Soluvia auto-match ${s.code}`;
  const regex = `FAC-${s.code}-\\d+`;

  // Idempotence : on cherche par (name, company_id)
  let existing: ReconcileModel | null = null;
  try {
    existing = await findReconcileModelByName(name, s.odoo_company_id);
  } catch (err) {
    return {
      societe: s.raison_sociale,
      code: s.code,
      action: 'error',
      detail: `search: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Odoo 19 : `rule_type` remplace par `trigger` (manual / auto_reconcile).
  // On reste sur 'manual' = suggestion validee par la compta (pas auto-post).
  // match_label='match_regex' + match_label_param=<regex> active le matching
  // par expression reguliere sur le libelle bancaire (payment_ref).
  const vals: Record<string, unknown> = {
    name,
    trigger: 'manual',
    match_label: 'match_regex',
    match_label_param: regex,
    company_id: s.odoo_company_id,
  };

  if (existing) {
    if (!APPLY) {
      return {
        societe: s.raison_sociale,
        code: s.code,
        action: 'dry-run-update',
        odoo_id: existing.id,
        detail: `match_label_param=${regex}`,
      };
    }
    try {
      await executeKw<boolean>('account.reconcile.model', 'write', [
        [existing.id],
        vals,
      ]);
      return {
        societe: s.raison_sociale,
        code: s.code,
        action: 'updated',
        odoo_id: existing.id,
      };
    } catch (err) {
      return {
        societe: s.raison_sociale,
        code: s.code,
        action: 'error',
        detail: `write: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (!APPLY) {
    return {
      societe: s.raison_sociale,
      code: s.code,
      action: 'dry-run-create',
      detail: `regex=${regex} company=${s.odoo_company_id}`,
    };
  }

  try {
    const id = await executeKw<number>('account.reconcile.model', 'create', [
      vals,
    ]);
    return {
      societe: s.raison_sociale,
      code: s.code,
      action: 'created',
      odoo_id: id,
    };
  } catch (err) {
    return {
      societe: s.raison_sociale,
      code: s.code,
      action: 'error',
      detail: `create: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (écritures Odoo)' : 'DRY-RUN'}`);
  console.log(`Tenant: ${ODOO_URL} / ${ODOO_DB}\n`);

  const societes = await loadSocietes();
  console.log(`Sociétés actives chargées: ${societes.length}\n`);

  const results: UpsertResult[] = [];
  for (const s of societes) {
    const r = await upsertReconcileModelForSociete(s);
    results.push(r);
    const marker = r.action.startsWith('error')
      ? 'X'
      : r.action === 'skipped'
        ? '-'
        : r.action.startsWith('dry-run')
          ? '?'
          : 'OK';
    console.log(
      `[${marker}] ${s.code.padEnd(8)} ${s.raison_sociale.padEnd(28)} ${r.action}${r.detail ? ` (${r.detail})` : ''}${r.odoo_id ? ` id=${r.odoo_id}` : ''}`,
    );
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nRésumé:', counts);

  if (!APPLY) {
    console.log('\nRelancer avec --apply pour écrire dans Odoo.');
  }

  if (results.some((r) => r.action === 'error')) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
