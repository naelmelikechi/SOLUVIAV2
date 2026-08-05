/**
 * Inspection READ-ONLY : balayage de TOUS les endpoints Eduvia lies a un
 * contrat, a la recherche d'une date de rupture exploitable automatiquement.
 *
 * Complete inspect-eduvia-rupture-fields.ts (qui ne couvrait que
 * GET /contracts/{id}) : on lit ici la spec OpenAPI + les sous-ressources
 * d'un contrat reellement en RUPTURE.
 *
 * Usage : npx tsx scripts/inspect-eduvia-rupture-endpoints.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { decryptApiKey } from '../lib/utils/encryption';
import { baseUrlFrom } from '../lib/eduvia/client';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.SUPAVIA_DASHBOARD_USER}:${process.env.SUPAVIA_DASHBOARD_PASSWORD}`,
  ).toString('base64');

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!/^\s*(select|with)/i.test(sql)) throw new Error('read-only only');
  const res = await fetch(`${BASE}/api/platform/pg-meta/default/query`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new Error(JSON.stringify(json).slice(0, 300));
  return json as T[];
}

/** Mots-cles d'une date de fin anticipee, tous vocabulaires confondus. */
const RUPTURE_HINT = /break|rupt|exit|termin|resil|cancel|annul|abandon|end/i;

async function get(
  url: string,
  apiKey: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, body: text };
  }
}

/** Toutes les cles rencontrees, a n'importe quelle profondeur. */
function collectKeys(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((v) => collectKeys(v, out, depth + 1));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.add(k);
    collectKeys(v, out, depth + 1);
  }
}

async function main(): Promise<void> {
  const [row] = await query<{
    ref: string;
    eduvia_id: number;
    instance_url: string;
    api_key_encrypted: string;
  }>(`
    SELECT c.ref, c.eduvia_id, k.instance_url, k.api_key_encrypted
    FROM contrats c
    JOIN client_api_keys k ON k.client_id = (
      SELECT client_id FROM projets WHERE id = c.projet_id
    )
    WHERE c.contract_state = 'RUPTURE' AND k.is_active = true
    ORDER BY c.ref
    LIMIT 1`);

  if (!row) {
    console.log('Aucun contrat RUPTURE joignable.');
    return;
  }
  const apiKey = decryptApiKey(row.api_key_encrypted);
  const base = baseUrlFrom(row.instance_url);
  console.log(`Contrat temoin : ${row.ref} (eduvia_id=${row.eduvia_id})\n`);

  // ── 1. Spec OpenAPI : y a-t-il un champ date de rupture documente ? ──
  console.log('===== 1. Spec OpenAPI : champs suspects =====');
  const spec = await get(`${base}/api/docs/openapi.yaml`, apiKey);
  if (typeof spec.body === 'string') {
    const lines = spec.body.split('\n');
    const hits = lines.filter(
      (l) => RUPTURE_HINT.test(l) && /date|_at\b/i.test(l),
    );
    console.log(
      `spec lue (${lines.length} lignes), ${hits.length} lignes suspectes :`,
    );
    [...new Set(hits.map((h) => h.trim()))]
      .slice(0, 40)
      .forEach((h) => console.log('  ' + h));
    const paths = lines
      .filter((l) => /^\s{2}\/api/.test(l))
      .map((l) => l.trim());
    console.log(`\nEndpoints documentes (${paths.length}) :`);
    paths.forEach((p) => console.log('  ' + p));
  } else {
    console.log(
      `HTTP ${spec.status} — spec non lisible :`,
      JSON.stringify(spec.body).slice(0, 200),
    );
  }

  // ── 2. Sous-ressources du contrat ──
  const SUB = [
    `/api/v1/contracts/${row.eduvia_id}`,
    `/api/v1/contracts/${row.eduvia_id}/progressions`,
    `/api/v1/contracts/${row.eduvia_id}/invoice_steps`,
    `/api/v1/contracts/${row.eduvia_id}/invoice_forecast_steps`,
    `/api/v1/contracts/${row.eduvia_id}/training_times`,
    `/api/v1/contracts/${row.eduvia_id}/events`,
    `/api/v1/contracts/${row.eduvia_id}/history`,
    `/api/v1/contracts/${row.eduvia_id}/breaks`,
  ];
  for (const path of SUB) {
    const { status, body } = await get(`${base}${path}`, apiKey);
    const keys = new Set<string>();
    collectKeys(body, keys);
    const suspects = [...keys].filter((k) => RUPTURE_HINT.test(k));
    console.log(`\n===== 2. GET ${path} -> HTTP ${status} =====`);
    if (status !== 200) {
      console.log('  ', JSON.stringify(body).slice(0, 150));
      continue;
    }
    console.log('   cles :', [...keys].sort().join(', ').slice(0, 600));
    if (suspects.length > 0) {
      console.log('   >>> SUSPECTS :', suspects.join(', '));
      console.log('   extrait :', JSON.stringify(body).slice(0, 900));
    }
  }
}

void main();
