/**
 * Garde-fou anti-drift de schéma : compare les colonnes du schéma `public`
 * de la PROD (Supavia, via pg-meta) avec celles d'un Supabase LOCAL migré.
 *
 * Pourquoi : une colonne créée en prod hors migration (hotfix SQL direct)
 * est invisible du repo -> `supabase gen types --local` la supprime de
 * types/database.ts et le code qui l'utilise casse silencieusement.
 * Cas vécu : contrats.support / support_first_equipment, réparé par
 * 20260610090001_repair_contrats_support_drift.sql.
 *
 * Directions :
 *  - PROD sans LOCAL -> ERREUR (colonne non reproductible par les
 *    migrations = la classe de bug ci-dessus). Exit 1.
 *  - LOCAL sans PROD -> info seulement (migration pas encore appliquée en
 *    prod : normal sur une PR avant merge, ou pendant que le workflow
 *    migrate tourne). Exit 0.
 *
 * Usage local :
 *   npx supabase start && npx supabase migration up
 *   npx tsx scripts/check-schema-drift.ts
 * En CI : step du workflow sql-tests.yml (Supabase local déjà démarré).
 *
 * Env requis (.env.local en local, GitHub Secrets en CI) :
 *   SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPAVIA_DASHBOARD_USER,
 *   SUPAVIA_DASHBOARD_PASSWORD. Optionnel : LOCAL_DB_URL.
 *
 * Volontairement SANS dépendance npm (tourne via `npx tsx` sans npm ci).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Exceptions documentées : paires "table.colonne" tolérées en prod sans
// migration (à n'utiliser qu'en dernier recours, avec un commentaire).
const ALLOWED_PROD_ONLY: string[] = [];

// Même requête des deux côtés : colonnes des tables et vues du schéma public.
const COLUMNS_SQL = `
  select c.table_name || '.' || c.column_name as col
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
    and t.table_type in ('BASE TABLE', 'VIEW')
  order by 1
`;

/** Parser .env.local minimal (pas de dotenv pour rester sans dépendance). */
function loadDotEnvLocal(): void {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]!] === undefined) {
        process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // Pas de .env.local (cas CI) : les secrets viennent de l'environnement.
  }
}

async function fetchProdColumns(): Promise<Set<string>> {
  const base = (
    process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/, '');
  const user = process.env.SUPAVIA_DASHBOARD_USER;
  const pass = process.env.SUPAVIA_DASHBOARD_PASSWORD;
  if (!base || !user || !pass) {
    throw new Error(
      'Env manquant : SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.',
    );
  }
  const url = `${base}/api/platform/pg-meta/default/query`;
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  // pg-meta Supavia est flaky sur le premier hit : retry avec backoff.
  const maxAttempts = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: COLUMNS_SQL }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status >= 400) {
        // 4xx Kong (credentials/URL) : deterministe, inutile de retenter.
        const fatal = new Error(
          `pg-meta HTTP ${res.status} (credentials ou URL invalides ?) : ${text.slice(0, 200)}`,
        );
        (fatal as Error & { fatal?: boolean }).fatal = true;
        throw fatal;
      }
      const json = JSON.parse(text) as unknown;
      if (!Array.isArray(json)) {
        const obj = json as { formattedError?: string; message?: string };
        throw new Error(
          `Erreur SQL pg-meta : ${obj.formattedError || obj.message || text.slice(0, 200)}`,
        );
      }
      return new Set((json as { col: string }[]).map((r) => r.col));
    } catch (err) {
      if ((err as Error & { fatal?: boolean }).fatal) throw err;
      if (attempt >= maxAttempts) throw err;
      const wait = Math.min(1000 * 2 ** (attempt - 1), 10_000);
      console.warn(
        `  pg-meta tentative ${attempt}/${maxAttempts} échouée (${(err as Error).message}), retry dans ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function fetchLocalColumns(): Set<string> {
  const dbUrl =
    process.env.LOCAL_DB_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const out = execFileSync('psql', [dbUrl, '-At', '-c', COLUMNS_SQL], {
    encoding: 'utf8',
  });
  return new Set(out.split('\n').filter(Boolean));
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

async function main() {
  loadDotEnvLocal();

  console.log('Drift de schéma : PROD (pg-meta) vs LOCAL (migrations)\n');
  const [prod, local] = [await fetchProdColumns(), fetchLocalColumns()];
  console.log(
    `  colonnes prod : ${prod.size} · colonnes local : ${local.size}`,
  );

  const prodOnly = diff(prod, local).filter(
    (c) => !ALLOWED_PROD_ONLY.includes(c),
  );
  const localOnly = diff(local, prod);

  if (localOnly.length) {
    console.log(
      `\nℹ Colonnes LOCAL absentes de PROD (migration en attente d'application, non bloquant) :`,
    );
    for (const c of localOnly) console.log(`    - ${c}`);
  }

  if (prodOnly.length) {
    console.error(
      `\n✗ DRIFT DÉTECTÉ : ${prodOnly.length} colonne(s) en PROD non reproductibles par les migrations du repo :`,
    );
    for (const c of prodOnly) console.error(`    - ${c}`);
    console.error(
      `\n  Danger : 'supabase gen types --local' supprimerait ces colonnes de types/database.ts.` +
        `\n  Fix : écrire une migration de réparation (modèle : 20260610090001_repair_contrats_support_drift.sql)` +
        `\n  ou, en dernier recours, documenter l'exception dans ALLOWED_PROD_ONLY de ce script.`,
    );
    process.exit(1);
  }

  console.log(
    '\n✓ Aucun drift : toute colonne prod est couverte par les migrations.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
