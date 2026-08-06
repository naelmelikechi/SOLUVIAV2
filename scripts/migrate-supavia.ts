/**
 * Runner de migrations pour Supavia (Supabase self-hosted, Postgres non exposé).
 *
 * Le Postgres n'étant pas exposé en externe, on applique les fichiers
 * `supabase/migrations/*.sql` via l'endpoint pg-meta (Kong basic auth =
 * Dashboard user/password de l'instance, exécute en `supabase_admin`).
 * Un tracking idempotent évite de rejouer une migration déjà appliquée.
 *
 * Usage :
 *   npx tsx scripts/migrate-supavia.ts            # dry-run (défaut, lecture seule)
 *   npx tsx scripts/migrate-supavia.ts --dry-run  # liste les migrations en attente
 *   npx tsx scripts/migrate-supavia.ts --baseline # marque TOUTES les migrations existantes comme appliquées (sans exécuter leur SQL)
 *   npx tsx scripts/migrate-supavia.ts --apply     # applique les migrations en attente (transaction + tracking atomiques)
 *
 * Env requis (.env.local en local, GitHub Secrets en CI) :
 *   NEXT_PUBLIC_SUPABASE_URL    -> sert à dériver l'URL pg-meta
 *   SUPAVIA_DASHBOARD_USER
 *   SUPAVIA_DASHBOARD_PASSWORD
 *
 * Env optionnel (garde-fous, cf audit #122 constat 17) :
 *   MIGRATE_BASELINE_CONFIRM=oui-je-sais-ce-que-je-fais
 *     Requis par --baseline, qui marque des migrations appliquées SANS exécuter
 *     leur SQL. Sans cette variable, --baseline refuse de tourner.
 *   MIGRATE_ALLOW_CHECKSUM_DRIFT=1
 *     Laisse passer une migration déjà appliquée mais éditée depuis (commentaire,
 *     reformatage). Sans elle, --apply échoue : le SQL édité ne sera jamais
 *     rejoué, donc le repo et la base divergent en silence.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const USER = process.env.SUPAVIA_DASHBOARD_USER;
const PASS = process.env.SUPAVIA_DASHBOARD_PASSWORD;
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');

if (!BASE || !USER || !PASS) {
  console.error(
    'Env manquant. Requis : SUPAVIA_API_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.',
  );
  process.exit(1);
}

const PGMETA = `${BASE}/api/platform/pg-meta/default/query`;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const TIMEOUT_MS = 60_000;
// L'endpoint pg-meta Supavia est flaky sur le premier hit (cold connection /
// TLS) : on retry généreusement avec un backoff exponentiel plafonné.
const MAX_ATTEMPTS = 6;

type Migration = {
  version: string;
  name: string;
  path: string;
  checksum: string;
};

/** Échappe une valeur pour un littéral SQL ('...'). */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Exécute du SQL via pg-meta. Retry sur les erreurs transitoires (timeout, 5xx,
 * réseau) car l'endpoint Supavia est parfois lent ; PAS de retry sur erreur SQL.
 */
async function query<T = Record<string, unknown>>(
  sql: string,
  attempt = 1,
): Promise<T[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(PGMETA, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError (timeout) ou erreur réseau -> transitoire
    if (attempt < MAX_ATTEMPTS)
      return retry(sql, attempt, (err as Error).message);
    throw new Error(
      `pg-meta injoignable après ${MAX_ATTEMPTS} tentatives : ${(err as Error).message}`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();

  // 5xx -> transitoire, on retry
  if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
    return retry(sql, attempt, `HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Réponse pg-meta non-JSON (HTTP ${res.status}) : ${text.slice(0, 200)}`,
    );
  }

  // pg-meta renvoie un objet { message, formattedError } en cas d'erreur SQL (fatale)
  if (!Array.isArray(json)) {
    const obj = json as { formattedError?: string; message?: string };
    throw new Error(
      `Erreur SQL pg-meta : ${obj.formattedError || obj.message || text}`,
    );
  }
  return json as T[];
}

async function retry<T>(
  sql: string,
  attempt: number,
  reason: string,
): Promise<T[]> {
  const wait = Math.min(1000 * 2 ** (attempt - 1), 15_000); // 1s,2s,4s,8s,15s…
  console.warn(
    `  ⚠ tentative ${attempt}/${MAX_ATTEMPTS} échouée (${reason}), retry dans ${wait}ms…`,
  );
  await new Promise((r) => setTimeout(r, wait));
  return query<T>(sql, attempt + 1);
}

function listMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // tri lexicographique : 0000x... < 2026... (ordre d'application correct)
    .map((file) => {
      const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      const underscore = file.indexOf('_');
      return {
        version: file, // nom de fichier complet = clé unique, sans ambiguïté de parsing
        name:
          underscore > -1 ? file.slice(underscore + 1, -4) : file.slice(0, -4),
        path: resolve(MIGRATIONS_DIR, file),
        checksum: sha256(content),
      };
    });
}

async function ensureTracking(): Promise<void> {
  await query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version    text primary key,
      name       text,
      statements text[],
      checksum   text,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedVersions(): Promise<Set<string>> {
  const rows = await query<{ version: string }>(
    `select version from supabase_migrations.schema_migrations`,
  );
  return new Set(rows.map((r) => r.version));
}

async function getAppliedVersionsSafe(): Promise<Set<string>> {
  try {
    return await getAppliedVersions();
  } catch (err) {
    // Table de tracking absente -> aucune migration trackée (premier run)
    if (
      /schema_migrations|does not exist|n'existe pas/i.test(
        (err as Error).message,
      )
    ) {
      return new Set();
    }
    throw err;
  }
}

async function cmdDryRun(): Promise<void> {
  const applied = await getAppliedVersionsSafe();
  const pending = listMigrations().filter((m) => !applied.has(m.version));
  console.log(`Trackées : ${applied.size} · En attente : ${pending.length}`);
  if (pending.length) {
    console.log('\nMigrations en attente :');
    for (const m of pending) console.log(`  - ${m.version}`);
    console.log('\n→ lancer avec --apply pour les appliquer.');
  } else {
    console.log('✓ Base à jour, rien à appliquer.');
  }
  // Le dry-run est l'endroit naturel pour decouvrir une derive de checksum,
  // avant de deployer. Il n'echoue pas (lecture seule) : il signale.
  await reportChecksumDrift();
}

/**
 * Compare le checksum stocke au checksum du fichier, pour les migrations DEJA
 * marquees appliquees.
 *
 * Pourquoi (audit #122, constat 17b) : le checksum etait calcule et insere, mais
 * JAMAIS relu. Editer une migration deja appliquee etait donc un no-op
 * totalement silencieux - ce qui arrive naturellement lors d'un rebase, d'une
 * correction de typo, ou d'un passage de prettier. Le fichier du repo et l'etat
 * reel de la base divergeaient sans que rien ne le signale.
 *
 * On echoue plutot que d'avertir : la correction attendue est soit de revenir
 * sur l'edition, soit d'ecrire une nouvelle migration. `MIGRATE_ALLOW_CHECKSUM_DRIFT=1`
 * permet de passer outre pour une edition dont on sait qu'elle est sans effet
 * (commentaire, reformatage).
 */
async function computeChecksumDrift(): Promise<string[]> {
  const rows = await query<{ version: string; checksum: string | null }>(
    `select version, checksum from supabase_migrations.schema_migrations`,
  );
  const stored = new Map(rows.map((r) => [r.version, r.checksum]));
  const drifted: string[] = [];
  for (const m of listMigrations()) {
    const s = stored.get(m.version);
    // Absent = migration en attente. Vide/null = ligne posee avant le tracking
    // des checksums (ou par --baseline) : rien a comparer.
    if (s === undefined || !s) continue;
    if (s !== m.checksum) drifted.push(`${m.version} (${m.name})`);
  }
  return drifted;
}

/** Variante lecture seule pour le dry-run : signale sans echouer. */
async function reportChecksumDrift(): Promise<void> {
  let drifted: string[] = [];
  try {
    drifted = await computeChecksumDrift();
  } catch {
    return; // table de tracking absente : rien a comparer
  }
  if (!drifted.length) return;
  console.warn(
    `\n⚠ ${drifted.length} migration(s) deja appliquee(s) ont ete editees depuis :\n  ${drifted.join('\n  ')}\n` +
      `  Leur SQL ne sera jamais rejoue. --apply refusera de tourner en l'etat.`,
  );
}

async function assertChecksumsMatch(): Promise<void> {
  const drifted = await computeChecksumDrift();
  if (!drifted.length) return;

  if (process.env.MIGRATE_ALLOW_CHECKSUM_DRIFT === '1') {
    console.warn(
      `⚠ ${drifted.length} migration(s) editee(s) apres application, ignore par MIGRATE_ALLOW_CHECKSUM_DRIFT :\n  ${drifted.join('\n  ')}`,
    );
    return;
  }

  console.error(
    `✗ ${drifted.length} migration(s) deja appliquee(s) ont ete editees depuis :\n  ${drifted.join('\n  ')}\n\n` +
      `Le SQL de ces fichiers ne sera JAMAIS rejoue : le repo et la base divergent.\n` +
      `Corriger en revenant sur l'edition, ou en ecrivant une nouvelle migration.\n` +
      `Si l'edition est sans effet (commentaire, reformatage) : MIGRATE_ALLOW_CHECKSUM_DRIFT=1.`,
  );
  process.exit(1);
}

async function cmdBaseline(): Promise<void> {
  // Garde (audit #122, constat 17a) : --baseline INSERE dans le tracking sans
  // jamais lire le corps SQL, et prend TOUTES les migrations du dossier, pas
  // seulement les anciennes. Le lancer aujourd'hui marquerait les migrations
  // reellement en attente comme appliquees, sans les executer, et le SQL serait
  // perdu en silence. Il etait expose en `npm run db:migrate:baseline` sans
  // aucune confirmation ni garde d'environnement.
  if (process.env.MIGRATE_BASELINE_CONFIRM !== 'oui-je-sais-ce-que-je-fais') {
    console.error(
      `✗ --baseline refuse sans confirmation explicite.\n\n` +
        `Cette commande marque des migrations comme appliquees SANS executer leur SQL.\n` +
        `Utilisee par erreur sur une base a jour, elle fait perdre definitivement\n` +
        `les migrations en attente.\n\n` +
        `Si c'est bien ce que tu veux (bascule d'instance, reprise de tracking) :\n` +
        `  MIGRATE_BASELINE_CONFIRM=oui-je-sais-ce-que-je-fais npm run db:migrate:baseline\n\n` +
        `Pour appliquer normalement les migrations en attente : npm run db:migrate`,
    );
    process.exit(1);
  }

  await ensureTracking();
  const migrations = listMigrations();

  // Liste ce qui va etre marque sans etre execute, pour que ce soit visible
  // dans les logs avant l'insert.
  const applied = await getAppliedVersionsSafe();
  const nouvelles = migrations.filter((m) => !applied.has(m.version));
  console.warn(
    `⚠ ${nouvelles.length} migration(s) vont etre marquees appliquees SANS execution :`,
  );
  for (const m of nouvelles) console.warn(`    ${m.version} (${m.name})`);

  const values = migrations
    .map((m) => `(${lit(m.version)}, ${lit(m.name)}, ${lit(m.checksum)})`)
    .join(',\n');
  const inserted = await query<{ version: string }>(`
    insert into supabase_migrations.schema_migrations (version, name, checksum)
    values
    ${values}
    on conflict (version) do nothing
    returning version;
  `);
  console.log(
    `Baseline : ${migrations.length} migrations vues, ${inserted.length} nouvellement marquées comme appliquées (le reste l'était déjà).`,
  );
}

async function cmdApply(): Promise<void> {
  await ensureTracking();
  // Avant d'appliquer quoi que ce soit : verifier que les migrations deja
  // appliquees n'ont pas ete editees depuis. Une divergence signifie que le
  // repo ne decrit plus l'etat reel de la base.
  await assertChecksumsMatch();
  const applied = await getAppliedVersions();
  const pending = listMigrations().filter((m) => !applied.has(m.version));

  if (!pending.length) {
    console.log('✓ Base à jour, aucune migration à appliquer.');
    return;
  }

  console.log(`${pending.length} migration(s) à appliquer :`);
  for (const m of pending) {
    process.stdout.write(`  → ${m.version} … `);
    const body = readFileSync(m.path, 'utf8').trim().replace(/;\s*$/, '');
    // Migration + insert de tracking dans une SEULE transaction = atomique.
    const sql = `begin;
${body};
insert into supabase_migrations.schema_migrations (version, name, checksum)
values (${lit(m.version)}, ${lit(m.name)}, ${lit(m.checksum)});
commit;`;
    try {
      await query(sql);
      console.log('OK');
    } catch (err) {
      console.log('ÉCHEC');
      console.error(
        `\nMigration ${m.version} échouée (rollback auto par la transaction) :\n${(err as Error).message}`,
      );
      process.exit(1);
    }
  }
  console.log(`\n✓ ${pending.length} migration(s) appliquée(s).`);
}

async function main() {
  const flag = process.argv.find((a) => a.startsWith('--')) ?? '--dry-run';
  console.log(`pg-meta : ${PGMETA}`);
  switch (flag) {
    case '--baseline':
      await cmdBaseline();
      break;
    case '--apply':
      await cmdApply();
      break;
    case '--dry-run':
      await cmdDryRun();
      break;
    default:
      console.error(
        `Flag inconnu : ${flag}. Utiliser --dry-run | --baseline | --apply.`,
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
