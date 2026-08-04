/**
 * Régénère le coffre Obsidian du "cerveau" à partir de `brain_notes`.
 *
 * Le miroir Postgres est la vérité ; ce script en dérive les fichiers Markdown
 * (frontmatter + [[wikilinks]]) d'un vault Obsidian, à commiter dans le dépôt
 * du coffre. Idempotent : réécrit chaque note, écrase le contenu périmé.
 *
 * Usage : tsx scripts/brain-vault-sync.ts <dossier-du-vault>
 * Env (.env.local) : NEXT_PUBLIC_SUPABASE_URL (ou SUPAVIA_API_URL),
 *                    SUPAVIA_DASHBOARD_USER, SUPAVIA_DASHBOARD_PASSWORD.
 */
import { config } from 'dotenv';
import { resolve, join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildMarkdown } from '../lib/brain/note';
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

async function main() {
  const vaultDir = process.argv[2];
  if (!vaultDir) {
    console.error('usage: tsx scripts/brain-vault-sync.ts <dossier-du-vault>');
    process.exit(1);
  }

  const rows = await query<BrainNote>(
    `select path, type, title, aliases, tags, links, body, frontmatter, source_ref, source_hash
     from public.brain_notes order by path`,
  );

  for (const note of rows) {
    const full = join(vaultDir, note.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, buildMarkdown(note), 'utf8');
  }
  writeFileSync(join(vaultDir, 'README.md'), README, 'utf8');
  console.log(`✓ ${rows.length} note(s) écrite(s) dans ${vaultDir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
