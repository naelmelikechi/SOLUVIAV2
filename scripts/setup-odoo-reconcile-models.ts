// Crée ou met à jour un `account.reconcile.model` Odoo PAR CLIENT, pour que la
// compta rapproche automatiquement une bank.statement.line entrante sur la bonne
// facture ouverte du client — sans saisie manuelle.
//
// Modèle généré (cf. modèle id 7 fait main « Match HEOL ACADEMY » qui fonctionne) :
//   match_label: contains <raison_sociale>   -> reconnait l'encaissement au libellé
//   mapped_partner_id: <res.partner du client> -> rattache le partenaire
//   match_journal_ids: [<journal BANQUE>]     -> scope au bon journal
//   trigger: 'manual' (défaut) | 'auto_reconcile' (--auto)
//
// Pourquoi PAR CLIENT et pas par n° de facture : les réfs portent le trigramme
// PROJET (FAC-HEO-0001) et la banque les reformate (« FACT HEO0001 »), donc le
// matching par numéro est fragile. Le nom du client, lui, est présent et stable
// dans le libellé bancaire ; Odoo choisit ensuite la facture ouverte par montant.
//
// Idempotence : recherche par nom (« Soluvia auto-match <raison_sociale> ») +
// company. Si un modèle mappe déjà ce partenaire sous un AUTRE nom (ex. id 7 fait
// main), on ne crée PAS de doublon : on le signale pour harmonisation manuelle.
//
// ⚠️ `--auto` (trigger=auto_reconcile) lettre sans intervention : sûr quand le
// client n'a qu'UNE facture ouverte du montant reçu. À activer après revue du
// dry-run par la compta (FINANCES-WISEMANH, propriétaire du rapprochement).
//
// Usage:
//   npx tsx scripts/setup-odoo-reconcile-models.ts            # dry-run, n'écrit rien
//   npx tsx scripts/setup-odoo-reconcile-models.ts --apply    # crée/met à jour (trigger manual)
//   npx tsx scripts/setup-odoo-reconcile-models.ts --apply --auto  # + trigger auto_reconcile
//
// Pré-requis : ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY +
//              NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local.

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildClientReconcileModelVals,
  type ReconcileModelVals,
} from '@/lib/odoo/reconcile-model-vals';

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
const AUTO = process.argv.includes('--auto');

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

// --- Chargement Supabase -----------------------------------------------------

interface Emettrice {
  id: string;
  code: string;
  raison_sociale: string;
  odoo_company_id: number | null;
}

interface Client {
  id: string;
  raison_sociale: string;
  siret: string | null;
  tva_intracommunautaire: string | null;
  is_demo: boolean;
  archive: boolean;
}

interface ClientEmettricePair {
  clientId: string;
  emettriceId: string;
}

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant',
    );
  }
  return createClient(url, key);
}

async function loadData(): Promise<{
  emettrices: Map<string, Emettrice>;
  clients: Map<string, Client>;
  pairs: ClientEmettricePair[];
}> {
  const sb = supa();

  const [emRes, clRes, faRes] = await Promise.all([
    sb
      .from('societes_emettrices')
      .select('id, code, raison_sociale, odoo_company_id')
      .eq('actif', true),
    sb
      .from('clients')
      .select(
        'id, raison_sociale, siret, tva_intracommunautaire, is_demo, archive',
      ),
    sb.from('factures').select('client_id, societe_emettrice_id'),
  ]);
  if (emRes.error) throw new Error(`load emettrices: ${emRes.error.message}`);
  if (clRes.error) throw new Error(`load clients: ${clRes.error.message}`);
  if (faRes.error) throw new Error(`load factures: ${faRes.error.message}`);

  const emettrices = new Map<string, Emettrice>(
    (emRes.data ?? []).map((e) => [e.id, e as Emettrice]),
  );
  const clients = new Map<string, Client>(
    (clRes.data ?? []).map((c) => [c.id, c as Client]),
  );

  // Paires (client, émettrice) distinctes issues des factures réelles : on ne
  // crée des modèles que pour les clients qu'on facture vraiment.
  const seen = new Set<string>();
  const pairs: ClientEmettricePair[] = [];
  for (const f of faRes.data ?? []) {
    const clientId = (f as { client_id: string | null }).client_id;
    const emettriceId = (f as { societe_emettrice_id: string | null })
      .societe_emettrice_id;
    if (!clientId || !emettriceId) continue;
    const key = `${clientId}:${emettriceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ clientId, emettriceId });
  }
  return { emettrices, clients, pairs };
}

// --- Résolutions Odoo (lecture seule, mémoïsées) -----------------------------

const bankJournalCache = new Map<number, number | null>();
async function resolveBankJournalId(companyId: number): Promise<number | null> {
  const cached = bankJournalCache.get(companyId);
  if (cached !== undefined) return cached;
  const ids = await executeKw<number[]>(
    'account.journal',
    'search',
    [
      [
        ['type', '=', 'bank'],
        ['company_id', '=', companyId],
      ],
    ],
    { limit: 2, order: 'id' },
  );
  if (ids.length > 1) {
    console.warn(
      `  ! company ${companyId} a plusieurs journaux banque (${ids.join(', ')}) — on prend ${ids[0]}`,
    );
  }
  const journalId = ids[0] ?? null;
  bankJournalCache.set(companyId, journalId);
  return journalId;
}

const partnerCache = new Map<string, number | null>();
async function resolvePartnerId(client: Client): Promise<number | null> {
  const cached = partnerCache.get(client.id);
  if (cached !== undefined) return cached;

  // Mêmes domaines que findOrCreatePartner (lib/odoo/client.ts) : SIRET dans
  // company_registry ou vat, ou TVA intracom dans vat.
  const cleanSiret = (client.siret ?? '').replace(/\s/g, '');
  const cleanVat = (client.tva_intracommunautaire ?? '').replace(/\s/g, '');
  const domains: unknown[][][] = [];
  if (cleanVat) domains.push([['vat', '=', cleanVat]]);
  if (cleanSiret) {
    domains.push([['vat', '=', cleanSiret]]);
    domains.push([['company_registry', '=', cleanSiret]]);
  }

  let partnerId: number | null = null;
  for (const domain of domains) {
    // oxlint-disable-next-line no-await-in-loop
    const ids = await executeKw<number[]>('res.partner', 'search', [domain], {
      limit: 1,
    });
    if (ids[0] !== undefined) {
      partnerId = ids[0];
      break;
    }
  }
  partnerCache.set(client.id, partnerId);
  return partnerId;
}

interface ExistingModel {
  id: number;
  name: string;
}

async function findReconcileModelByName(
  name: string,
  companyId: number,
): Promise<ExistingModel | null> {
  const results = await executeKw<ExistingModel[]>(
    'account.reconcile.model',
    'search_read',
    [
      [
        ['name', '=', name],
        ['company_id', '=', companyId],
      ],
    ],
    { fields: ['id', 'name'], limit: 1 },
  );
  return results[0] ?? null;
}

async function findReconcileModelByPartner(
  partnerId: number,
  companyId: number,
): Promise<ExistingModel | null> {
  const results = await executeKw<ExistingModel[]>(
    'account.reconcile.model',
    'search_read',
    [
      [
        ['mapped_partner_id', '=', partnerId],
        ['company_id', '=', companyId],
      ],
    ],
    { fields: ['id', 'name'], limit: 1 },
  );
  return results[0] ?? null;
}

// --- Upsert par client -------------------------------------------------------

interface UpsertResult {
  client: string;
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

async function upsertForPair(
  pair: ClientEmettricePair,
  emettrices: Map<string, Emettrice>,
  clients: Map<string, Client>,
): Promise<UpsertResult> {
  const emettrice = emettrices.get(pair.emettriceId);
  const client = clients.get(pair.clientId);
  const label = client?.raison_sociale ?? pair.clientId;

  if (!client) {
    return { client: label, action: 'skipped', detail: 'client introuvable' };
  }
  if (client.is_demo || client.archive) {
    return { client: label, action: 'skipped', detail: 'client démo/archivé' };
  }
  if (!emettrice?.odoo_company_id) {
    return {
      client: label,
      action: 'skipped',
      detail: 'émettrice sans odoo_company_id',
    };
  }
  const companyId = emettrice.odoo_company_id;

  const bankJournalId = await resolveBankJournalId(companyId);
  if (bankJournalId === null) {
    return {
      client: label,
      action: 'skipped',
      detail: `aucun journal banque pour company ${companyId}`,
    };
  }

  const partnerId = await resolvePartnerId(client);
  if (partnerId === null) {
    return {
      client: label,
      action: 'skipped',
      detail: 'partenaire Odoo introuvable (SIRET/TVA non rapprochés)',
    };
  }

  const vals: ReconcileModelVals = buildClientReconcileModelVals({
    raisonSociale: client.raison_sociale,
    partnerId,
    companyId,
    bankJournalId,
    auto: AUTO,
  });

  const existing = await findReconcileModelByName(vals.name, companyId);
  if (existing) {
    if (!APPLY) {
      return {
        client: label,
        action: 'dry-run-update',
        odoo_id: existing.id,
        detail: `trigger=${vals.trigger}`,
      };
    }
    await executeKw('account.reconcile.model', 'write', [[existing.id], vals]);
    return { client: label, action: 'updated', odoo_id: existing.id };
  }

  // Pas de modèle à notre nom : un modèle fait main pourrait déjà mapper ce
  // partenaire (ex. id 7). On évite le doublon et on le signale.
  const byPartner = await findReconcileModelByPartner(partnerId, companyId);
  if (byPartner) {
    return {
      client: label,
      action: 'skipped',
      odoo_id: byPartner.id,
      detail: `modèle partenaire existant « ${byPartner.name} » — harmoniser à la main`,
    };
  }

  if (!APPLY) {
    return {
      client: label,
      action: 'dry-run-create',
      detail: `partner=${partnerId} journal=${bankJournalId} trigger=${vals.trigger}`,
    };
  }
  const id = await executeKw<number>('account.reconcile.model', 'create', [
    vals,
  ]);
  // mapped_partner_id est compute readonly : ignore au create, persiste au
  // write (piege documente — « write apres create obligatoire »).
  await executeKw('account.reconcile.model', 'write', [
    [id],
    { mapped_partner_id: vals.mapped_partner_id },
  ]);
  return { client: label, action: 'created', odoo_id: id };
}

async function main() {
  console.log(
    `Mode: ${APPLY ? 'APPLY (écritures Odoo)' : 'DRY-RUN'}${AUTO ? ' + AUTO (trigger=auto_reconcile)' : ' (trigger=manual)'}`,
  );
  console.log(`Tenant: ${ODOO_URL} / ${ODOO_DB}\n`);

  const { emettrices, clients, pairs } = await loadData();
  console.log(
    `Paires (client, émettrice) issues des factures: ${pairs.length}\n`,
  );

  const results: UpsertResult[] = [];
  for (const pair of pairs) {
    // oxlint-disable-next-line no-await-in-loop
    const r = await upsertForPair(pair, emettrices, clients);
    results.push(r);
    const marker =
      r.action === 'error'
        ? 'X'
        : r.action === 'skipped'
          ? '-'
          : r.action.startsWith('dry-run')
            ? '?'
            : 'OK';
    console.log(
      `[${marker}] ${r.client.padEnd(32)} ${r.action}${r.detail ? ` (${r.detail})` : ''}${r.odoo_id ? ` id=${r.odoo_id}` : ''}`,
    );
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nRésumé:', counts);

  if (!APPLY) {
    console.log(
      '\nRelancer avec --apply pour écrire dans Odoo (ajouter --auto pour le lettrage automatique).',
    );
  }

  if (results.some((r) => r.action === 'error')) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
