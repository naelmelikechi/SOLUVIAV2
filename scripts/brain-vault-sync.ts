/**
 * Régénère le coffre Obsidian du "cerveau" à partir de `brain_notes`.
 *
 * Le miroir Postgres est la vérité ; ce script en dérive les fichiers Markdown
 * (frontmatter + [[wikilinks]]) d'un vault Obsidian, à commiter dans le dépôt
 * du coffre. Idempotent : réécrit chaque note, écrase le contenu périmé.
 *
 * Usage : tsx scripts/brain-vault-sync.ts <dossier-du-vault> [--prune]
 *
 *   (sans drapeau)  n'efface RIEN : liste les fichiers orphelins détectés
 *                   (notes archivées, anciens chemins, notes supprimées en
 *                   base) et invite à relancer avec --prune.
 *   --prune         supprime ces orphelins. Uniquement dans les dossiers de
 *                   notes (fiches/, livrables/, conversations/, entites/),
 *                   uniquement les .md portant un `type` de note en
 *                   frontmatter, et jamais si la base n'a rendu aucune note
 *                   vivante. Le coffre est un dépôt git : `git restore` /
 *                   `git checkout` rattrape une suppression de trop.
 *
 * Env (.env.local) : NEXT_PUBLIC_SUPABASE_URL (ou SUPAVIA_API_URL),
 *                    SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.
 */
import { config } from 'dotenv';
import { resolve, join, dirname } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  buildMarkdown,
  fichiersOrphelins,
  NOTE_FOLDERS,
  type FichierCoffre,
} from '../lib/brain/note';
import type { BrainNote } from '../lib/brain/types';

config({ path: resolve(process.cwd(), '.env.local') });

const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const USER = process.env.SUPAVIA_DASHBOARD_USER;
const PASS = process.env.SUPAVIA_DASHBOARD_PASSWORD;
if (!BASE || !USER || !PASS) {
  throw new Error(
    'Env manquant : NEXT_PUBLIC_SUPABASE_URL (ou SUPAVIA_API_URL) + SUPAVIA_DASHBOARD_USER/PASSWORD.',
  );
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const PGMETA = `${BASE}/api/platform/pg-meta/default/query`;

async function query<T>(sql: string): Promise<T[]> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(PGMETA, {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const json: unknown = await res.json();
      if (Array.isArray(json)) return json as T[];
      throw new Error(`pg-meta: ${JSON.stringify(json).slice(0, 200)}`);
    } catch (e) {
      if (attempt === 6) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return [];
}

const README = `# Cerveau Soluvia — coffre Obsidian

Coffre généré depuis \`brain_notes\` (la base de connaissance de l'assistant process de SOLUVIAV2). Les notes sont analysées par Claude et reliées par \`[[wikilinks]]\`. Ouvrir ce dossier comme un vault Obsidian.

- \`fiches/\` — process finalisés (résumé, points clés, entités)
- \`livrables/\` — documents Drive analysés
- \`entites/\` — entités-carrefour (OPCO, tickets, missions…) qui relient le graphe
- \`conversations/\` — Q/R capitalisées

Ne pas éditer à la main : régénéré par \`scripts/brain-vault-sync.ts\`.
`;

/**
 * Les `.md` présents sous les dossiers de notes du coffre. Ne descend que là :
 * la racine (`_lacunes.md`, `README.md`), `.obsidian/`, `.git/` et tout dossier
 * créé par l'utilisateur restent hors de vue de l'élagage. Les entrées cachées
 * sont ignorées, les liens symboliques aussi (ni fichier ni dossier régulier).
 */
function listerFichiersNotes(vaultDir: string): FichierCoffre[] {
  const trouves: FichierCoffre[] = [];
  const marcher = (abs: string, relatif: string) => {
    for (const entree of readdirSync(abs, { withFileTypes: true })) {
      if (entree.name.startsWith('.')) continue;
      const sousAbs = join(abs, entree.name);
      const sousRel = `${relatif}/${entree.name}`;
      if (entree.isDirectory()) marcher(sousAbs, sousRel);
      else if (entree.isFile() && entree.name.endsWith('.md'))
        trouves.push({ path: sousRel, content: readFileSync(sousAbs, 'utf8') });
    }
  };
  for (const dossier of NOTE_FOLDERS) {
    const racine = join(vaultDir, dossier);
    if (existsSync(racine)) marcher(racine, dossier);
  }
  return trouves;
}

/**
 * Élagage des fichiers que le coffre ne devrait plus contenir. Opt-in : sans
 * `--prune` on se contente de les nommer. Supprimer par défaut dans un dossier
 * que l'utilisateur édite lui-même dans Obsidian serait inacceptable.
 */
function elaguer(vaultDir: string, notes: BrainNote[], prune: boolean): void {
  // Une base injoignable ou vide ne doit JAMAIS se traduire par un coffre vidé.
  // `fichiersOrphelins` refuse déjà une liste de conservation vide ; on le dit
  // aussi ici, pour que la sortie explique le non-élagage au lieu de se taire.
  if (notes.length === 0) {
    console.log(
      '⚠ aucune note vivante lue en base : élagage ignoré (une lecture vide ' +
        'ne doit pas vider le coffre).',
    );
    return;
  }

  const orphelins = fichiersOrphelins(
    listerFichiersNotes(vaultDir),
    notes.map((n) => n.path),
  );
  if (orphelins.length === 0) {
    console.log('✓ aucun fichier orphelin.');
    return;
  }

  if (!prune) {
    console.log(`\n${orphelins.length} fichier(s) orphelin(s) détecté(s) :`);
    for (const path of orphelins) console.log(`  - ${path}`);
    console.log(
      `\nRien n'a été supprimé. Relancer avec --prune pour les effacer :\n` +
        `  npm run brain:vault -- ${vaultDir} --prune`,
    );
    return;
  }

  console.log(`\nÉlagage de ${orphelins.length} fichier(s) orphelin(s) :`);
  for (const path of orphelins) {
    rmSync(join(vaultDir, path));
    console.log(`  supprimé ${path}`);
  }
  console.log(
    `\n✓ ${orphelins.length} fichier(s) supprimé(s). Le coffre est un dépôt ` +
      `git : en cas de suppression de trop, \`git -C ${vaultDir} restore .\` ` +
      `(avant commit) ou \`git -C ${vaultDir} revert\` rétablit les fichiers.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const prune = args.includes('--prune');
  const vaultDir = args.find((a) => !a.startsWith('--'));
  if (!vaultDir) {
    console.error(
      'usage: tsx scripts/brain-vault-sync.ts <dossier-du-vault> [--prune]',
    );
    process.exit(1);
  }

  const rows = await query<BrainNote>(
    `select path, type, title, aliases, tags, links, body, frontmatter, source_ref, source_hash
     from public.brain_notes order by path`,
  );

  // Une note archivée par un arbitrage (`frontmatter.archive`, posé par
  // `arbitrateStaleAction`) est sortie du cerveau : l'assistant ne s'en sert
  // plus pour répondre, le coffre ne doit donc pas continuer à l'exposer.
  // Elle reste en base, récupérable — c'est tout l'intérêt du drapeau.
  const archivees = rows.filter((n) => n.frontmatter?.archive === true);
  const notes = rows.filter((n) => n.frontmatter?.archive !== true);

  for (const note of notes) {
    const full = join(vaultDir, note.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, buildMarkdown(note), 'utf8');
  }
  writeFileSync(join(vaultDir, 'README.md'), README, 'utf8');
  console.log(`✓ ${notes.length} note(s) écrite(s) dans ${vaultDir}`);
  if (archivees.length)
    console.log(
      `  ${archivees.length} note(s) archivée(s) non écrite(s) ; ` +
        `leur .md éventuel est un orphelin (cf. ci-dessous).`,
    );

  elaguer(vaultDir, notes, prune);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
