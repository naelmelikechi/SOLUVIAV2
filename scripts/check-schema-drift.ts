/**
 * Garde-fou anti-drift de schéma : compare les colonnes des schémas `public`
 * et `crm` de la PROD (Supavia, via pg-meta) avec celles d'un Supabase LOCAL
 * migré. Le schéma `crm` est inclus car lib/crm/database.types.ts est maintenu
 * A LA MAIN (pas de gen types) : un hotfix SQL prod sur crm.* serait sinon
 * invisible de tout filet automatique.
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

// Exceptions documentées : triplets "schema.table.colonne" tolérés en prod
// sans migration (à n'utiliser qu'en dernier recours, avec un commentaire).
const ALLOWED_PROD_ONLY: string[] = [];

// ---------------------------------------------------------------------------
// Périmètre comparé (audit #122, constat 17c / chantier B)
//
// Le check ne comparait que des NOMS DE COLONNES, sur public et crm. Il était
// donc aveugle aux policies, fonctions, triggers, index, contraintes, et au
// schéma `storage` entier. C'est précisément ce qui a laissé passer l'incident
// des policies de buckets documents : elles n'avaient jamais tourné en prod,
// « 0 objet dans ces deux buckets depuis toujours », donc aucun document
// déposable pendant des mois, sans qu'aucun filet ne le signale.
//
// POURQUOI ON COMPARE DES IDENTITÉS ET NON DU TEXTE GÉNÉRÉ.
// Vérifié : la prod tourne sur PostgreSQL 15.8, le Supabase local du repo sur
// 17.6. Or le texte produit par pg_get_expr / pg_get_constraintdef / indexdef /
// pg_get_functiondef change entre versions majeures (reformatage du deparse).
// Comparer ces textes ferait échouer la CI à chaque run, sur des différences
// purement cosmétiques. On compare donc l'EXISTENCE et la PORTÉE des objets :
// nom, table, commande, rôles, signature. C'est ce qui attrape la classe
// d'incident visée (un objet qui n'existe pas en prod), pas une reformulation.
//
// LIMITE ASSUMÉE, à connaître : une policy dont le `USING` a été modifié en
// prod sans migration, en gardant le même nom, la même commande et les mêmes
// rôles, n'est PAS détectée. Couvrir ce cas demande un environnement local sur
// la même version majeure que la prod ; c'est l'option 2 du chantier B.
//
// Les objets appartenant à une extension (pg_trgm, vector...) sont exclus :
// leur inventaire dépend de la version de l'extension installée, pas des
// migrations du repo.
// ---------------------------------------------------------------------------

const NOT_EXTENSION_OWNED = `
  not exists (
    select 1 from pg_depend d
    where d.objid = %OID% and d.deptype = 'e'
  )
`;

const INVENTORY_SQL = `
  -- Colonnes des tables et vues (périmètre historique du check).
  select 'colonne' as dim,
         c.table_schema || '.' || c.table_name || '.' || c.column_name as id
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema in ('public', 'crm')
    and t.table_type in ('BASE TABLE', 'VIEW')

  union all

  -- Policies RLS : nom + commande + rôles. "storage" est inclus, c'est là que
  -- l'incident des buckets documents est passé.
  select 'policy',
         p.schemaname || '.' || p.tablename || '.' || p.policyname
           || ' [' || p.cmd || ' to ' || p.roles::text || ']'
  from pg_policies p
  where p.schemaname in ('public', 'crm', 'storage')

  union all

  -- RLS activée ou non sur chaque table : une policy présente sans RLS active
  -- ne protège rien.
  select 'rls',
         n.nspname || '.' || c.relname || ' rls=' || c.relrowsecurity::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'crm') and c.relkind = 'r'

  union all

  -- Fonctions : signature + SECURITY DEFINER (le flag qui change qui exécute).
  select 'fonction',
         n.nspname || '.' || p.proname
           || '(' || pg_get_function_identity_arguments(p.oid) || ')'
           || case when p.prosecdef then ' SECURITY DEFINER' else '' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'crm')
    and ${NOT_EXTENSION_OWNED.replace('%OID%', 'p.oid')}

  union all

  -- Triggers (hors triggers internes de contraintes).
  select 'trigger',
         n.nspname || '.' || c.relname || '.' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'crm', 'storage')
    and not t.tgisinternal

  union all

  -- Index : nom seul. L'indexdef est du texte généré, donc hors périmètre.
  select 'index',
         i.schemaname || '.' || i.tablename || '.' || i.indexname
  from pg_indexes i
  where i.schemaname in ('public', 'crm')

  union all

  -- Contraintes : nom + type (p/f/u/c), sans la définition textuelle.
  select 'contrainte',
         n.nspname || '.' || c.relname || '.' || con.conname
           || ' [' || con.contype::text || ']'
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'crm')
    and ${NOT_EXTENSION_OWNED.replace('%OID%', 'con.oid')}

  order by 1, 2
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

async function fetchProdInventory(): Promise<Set<string>> {
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
        body: JSON.stringify({ query: INVENTORY_SQL }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status >= 400) {
        // 4xx : deterministe, inutile de retenter. On distingue une erreur SQL
        // (pg-meta renvoie 400 avec formattedError) d'un probleme de
        // credentials : accuser les secrets a tort fait perdre du temps.
        let detail = `credentials ou URL invalides ? : ${text.slice(0, 200)}`;
        try {
          const parsed = JSON.parse(text) as { formattedError?: string };
          if (parsed.formattedError)
            detail = `erreur SQL : ${parsed.formattedError}`;
        } catch {
          // corps non-JSON : on garde le message generique
        }
        const fatal = new Error(`pg-meta HTTP ${res.status} (${detail})`);
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
      return new Set(
        (json as { dim: string; id: string }[]).map((r) => `${r.dim}\t${r.id}`),
      );
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

function fetchLocalInventory(): Set<string> {
  const dbUrl =
    process.env.LOCAL_DB_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  // -F $'\t' : meme separateur que le cote prod, pour que les deux ensembles
  // soient directement comparables.
  const out = execFileSync(
    'psql',
    [dbUrl, '-At', '-F', '\t', '-c', INVENTORY_SQL],
    { encoding: 'utf8' },
  );
  return new Set(out.split('\n').filter(Boolean));
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

async function main() {
  loadDotEnvLocal();

  console.log('Drift de schéma : PROD (pg-meta) vs LOCAL (migrations)\n');
  const [prod, local] = [await fetchProdInventory(), fetchLocalInventory()];

  // Recap par dimension, pour que la sortie reste lisible quand tout va bien.
  const parDim = (set: Set<string>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const e of set) {
      const dim = e.split('\t')[0]!;
      m.set(dim, (m.get(dim) ?? 0) + 1);
    }
    return m;
  };
  const pd = parDim(prod);
  const ld = parDim(local);
  for (const dim of [...new Set([...pd.keys(), ...ld.keys()])].sort()) {
    console.log(
      `  ${dim.padEnd(11)} prod ${String(pd.get(dim) ?? 0).padStart(4)} · local ${String(ld.get(dim) ?? 0).padStart(4)}`,
    );
  }

  const prodOnly = diff(prod, local).filter(
    (c) => !ALLOWED_PROD_ONLY.includes(c.split('\t')[1] ?? c),
  );
  const localOnly = diff(local, prod);

  const fmt = (e: string) => {
    const [dim, id] = e.split('\t');
    return `    [${dim}] ${id}`;
  };

  if (localOnly.length) {
    console.log(
      `\nℹ ${localOnly.length} objet(s) LOCAL absent(s) de PROD (migration en attente d'application, non bloquant) :`,
    );
    for (const c of localOnly) console.log(fmt(c));
  }

  if (prodOnly.length) {
    console.error(
      `\n✗ DRIFT DÉTECTÉ : ${prodOnly.length} objet(s) en PROD non reproductible(s) par les migrations du repo :`,
    );
    for (const c of prodOnly) console.error(fmt(c));
    console.error(
      `\n  Une colonne : 'supabase gen types --local' la supprimerait de types/database.ts` +
        `\n  (et une colonne crm.* hors migration est invisible de lib/crm/database.types.ts, maintenu a la main).` +
        `\n  Une policy, un trigger, un index ou une contrainte : la prod applique une regle` +
        `\n  que le repo ne decrit pas, donc un rebuild depuis les migrations ne la reproduirait pas.` +
        `\n  Fix : écrire une migration de réparation (modèle : 20260610090001_repair_contrats_support_drift.sql)` +
        `\n  ou, en dernier recours, documenter l'exception dans ALLOWED_PROD_ONLY de ce script.`,
    );
    process.exit(1);
  }

  console.log(
    '\n✓ Aucun drift : tout objet prod du périmètre est couvert par les migrations.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
