// Audit one-shot LECTURE SEULE du rapprochement bancaire Odoo <-> factures Soluvia.
// Verifie :
//   1. les account.reconcile.model presents (lettrage auto par client) et leur trigger
//   2. les lignes de releve bancaire entrantes non lettrees
//   3. la coherence statut facture Soluvia <-> payment_state Odoo
//   4. les factures emises non poussees vers Odoo
//   5. le matching bank line <-> facture ouverte (meme logique que le sync)
// Run : npx tsx scripts/audit-odoo-reconciliation.ts

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { matchUnreconciledBankLine } from '@/lib/odoo/bank-line-match';

config({ path: resolve(process.cwd(), '.env.local') });

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string; debug?: string } };
}

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;

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

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function main() {
  console.log(`Tenant Odoo: ${ODOO_URL} / ${ODOO_DB}\n`);

  // ----- 1. Modeles de rapprochement ---------------------------------------
  type ReconModel = {
    id: number;
    name: string;
    trigger: string;
    active: boolean;
    match_label: string | false;
    match_label_param: string | false;
    mapped_partner_id: [number, string] | false;
    company_id: [number, string] | false;
  };
  const models = await executeKw<ReconModel[]>(
    'account.reconcile.model',
    'search_read',
    [[['rule_type', '=', 'writeoff_suggestion']]],
    {
      fields: [
        'name',
        'trigger',
        'active',
        'match_label',
        'match_label_param',
        'mapped_partner_id',
        'company_id',
      ],
    },
  ).catch(async () => {
    // rule_type n'existe pas sur toutes les versions : fallback sans filtre
    return executeKw<ReconModel[]>(
      'account.reconcile.model',
      'search_read',
      [[]],
      {
        fields: [
          'name',
          'trigger',
          'active',
          'match_label',
          'match_label_param',
          'mapped_partner_id',
          'company_id',
        ],
      },
    );
  });
  console.log(`=== 1. Modèles de rapprochement (${models.length}) ===`);
  for (const m of models) {
    console.log(
      `  [${m.id}] ${m.name} | trigger=${m.trigger} | active=${m.active} | label~"${m.match_label_param || ''}" | partner=${Array.isArray(m.mapped_partner_id) ? m.mapped_partner_id[1] : '-'} | company=${Array.isArray(m.company_id) ? m.company_id[1] : '-'}`,
    );
  }

  // ----- 2. Lignes bancaires entrantes non lettrees -------------------------
  type BankLine = {
    id: number;
    date: string;
    amount: number;
    payment_ref: string | false;
    partner_id: [number, string] | false;
    journal_id: [number, string] | false;
    company_id: [number, string] | false;
  };
  const bankLines = await executeKw<BankLine[]>(
    'account.bank.statement.line',
    'search_read',
    [
      [
        ['is_reconciled', '=', false],
        ['amount', '>', 0],
      ],
    ],
    {
      fields: [
        'date',
        'amount',
        'payment_ref',
        'partner_id',
        'journal_id',
        'company_id',
      ],
      order: 'date desc',
      limit: 200,
    },
  );
  console.log(
    `\n=== 2. Lignes bancaires entrantes NON lettrées (${bankLines.length}) ===`,
  );
  for (const l of bankLines) {
    console.log(
      `  [${l.id}] ${l.date} | ${l.amount.toFixed(2)} € | "${l.payment_ref || ''}" | partner=${Array.isArray(l.partner_id) ? l.partner_id[1] : '-'} | journal=${Array.isArray(l.journal_id) ? l.journal_id[1] : '-'} | company=${Array.isArray(l.company_id) ? l.company_id[1] : '-'}`,
    );
  }

  // ----- 3. Factures Soluvia <-> payment_state Odoo --------------------------
  const sb = supa();
  const { data: factures, error } = await sb
    .from('factures')
    .select(
      'id, ref, statut, odoo_id, montant_ttc, est_avoir, date_emission, client:clients!factures_client_id_fkey(raison_sociale, is_demo)',
    )
    .order('ref');
  if (error) throw new Error(`load factures: ${error.message}`);

  type Move = {
    id: number;
    ref: string | false;
    state: string;
    payment_state: string;
    amount_total: number;
    amount_residual: number;
  };
  const withOdoo = (factures ?? []).filter((f) => f.odoo_id);
  const moveIds = withOdoo
    .map((f) => Number(f.odoo_id))
    .filter((n) => Number.isInteger(n) && n > 0);
  const moves =
    moveIds.length > 0
      ? await executeKw<Move[]>('account.move', 'read', [moveIds], {
          fields: [
            'ref',
            'state',
            'payment_state',
            'amount_total',
            'amount_residual',
          ],
        })
      : [];
  const moveById = new Map(moves.map((m) => [String(m.id), m]));

  console.log(`\n=== 3. Cohérence statut Soluvia <-> Odoo ===`);
  console.log(
    `  Factures Soluvia: ${factures?.length ?? 0} dont ${withOdoo.length} avec odoo_id`,
  );
  const mismatches: string[] = [];
  for (const f of factures ?? []) {
    const isDemo =
      (f.client as unknown as { is_demo: boolean | null } | null)?.is_demo ===
      true;
    if (isDemo) continue;
    const m = f.odoo_id ? moveById.get(String(f.odoo_id)) : undefined;
    if (!f.odoo_id) {
      if (['emise', 'en_retard'].includes(f.statut as string)) {
        mismatches.push(
          `  [NON POUSSÉE] ${f.ref} statut=${f.statut} sans odoo_id`,
        );
      }
      continue;
    }
    if (!m) {
      mismatches.push(
        `  [INTROUVABLE] ${f.ref} odoo_id=${f.odoo_id} absent d'Odoo`,
      );
      continue;
    }
    const odooPaid =
      m.payment_state === 'paid' || m.payment_state === 'in_payment';
    if (f.statut === 'payee' && !odooPaid && !f.est_avoir) {
      mismatches.push(
        `  [DÉSYNC] ${f.ref} payée côté Soluvia mais Odoo payment_state=${m.payment_state} (residual ${m.amount_residual})`,
      );
    }
    if (['emise', 'en_retard'].includes(f.statut as string) && odooPaid) {
      mismatches.push(
        `  [DÉSYNC] ${f.ref} ${f.statut} côté Soluvia mais Odoo payment_state=${m.payment_state}`,
      );
    }
    if (m.state !== 'posted') {
      mismatches.push(
        `  [ÉTAT] ${f.ref} odoo state=${m.state} (attendu posted)`,
      );
    }
    const diff = Math.abs(Number(f.montant_ttc) - m.amount_total);
    if (diff > 0.01) {
      mismatches.push(
        `  [MONTANT] ${f.ref} TTC Soluvia=${f.montant_ttc} vs Odoo=${m.amount_total}`,
      );
    }
  }
  if (mismatches.length === 0) {
    console.log('  OK : aucun écart détecté');
  } else {
    mismatches.forEach((l) => console.log(l));
  }

  // ----- 4. Matching lignes non lettrées <-> factures ouvertes ---------------
  console.log(
    `\n=== 4. Matching lignes non lettrées <-> factures ouvertes ===`,
  );
  const open = (factures ?? []).filter(
    (f) =>
      ['emise', 'en_retard'].includes(f.statut as string) &&
      f.odoo_id &&
      !f.est_avoir,
  );
  const candidates = bankLines.map((l) => ({
    id: l.id,
    amount: Number(l.amount),
    payment_ref: typeof l.payment_ref === 'string' ? l.payment_ref : '',
  }));
  let matched = 0;
  for (const f of open) {
    const line = matchUnreconciledBankLine(
      { ref: f.ref ?? '', montantTtc: Number(f.montant_ttc) },
      candidates,
    );
    if (line) {
      matched++;
      console.log(
        `  MATCH: ${f.ref} (${Number(f.montant_ttc).toFixed(2)} €) <-> ligne bancaire #${line.id} "${line.payment_ref}"`,
      );
    }
  }
  console.log(
    `  Factures ouvertes avec odoo_id: ${open.length} | matchs stricts: ${matched}`,
  );

  // ----- 5. Derniers logs de sync --------------------------------------------
  const { data: logs } = await sb
    .from('odoo_sync_logs')
    .select('created_at, direction, entity_type, statut, erreur')
    .order('created_at', { ascending: false })
    .limit(12);
  console.log(`\n=== 5. Derniers logs odoo_sync_logs ===`);
  for (const l of logs ?? []) {
    console.log(
      `  ${l.created_at} | ${l.direction}/${l.entity_type} | ${l.statut}${l.erreur ? ` | ${String(l.erreur).slice(0, 120)}` : ''}`,
    );
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
