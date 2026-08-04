/**
 * Ingestion LOCALE du cerveau (fiches + livrables Drive) via Claude Code (Max).
 *
 * L'abonnement Max ne peut pas alimenter l'API serveur : l'analyse se fait donc
 * hors-ligne, en shellant vers la CLI `claude -p` (qui utilise TON auth Claude
 * Code = tes tokens Max). Le script :
 *   1. lit les fiches (process_index) + leurs livrables Drive,
 *   2. analyse chaque source NOUVELLE / MODIFIÉE (hash) avec Claude,
 *   3. upsert les notes dans `brain_notes` (miroir Postgres, via pg-meta),
 *   4. (option --vault <dir>) régénère le coffre Obsidian et le pousse.
 *
 * Prérequis (sur TA machine) :
 *   - `claude` (Claude Code) installé et authentifié avec ton compte Max,
 *   - `.env.local` : NEXT_PUBLIC_SUPABASE_URL (ou SUPAVIA_API_URL),
 *     SUPAVIA_DASHBOARD_USER/PASSWORD, et GOOGLE_SERVICE_ACCOUNT_KEY (livrables).
 *
 * Usage :
 *   tsx scripts/brain-ingest.ts --dry-run              # liste, aucune écriture
 *   tsx scripts/brain-ingest.ts                        # ingère (fiches + livrables)
 *   tsx scripts/brain-ingest.ts --fiches-only          # sans les livrables
 *   tsx scripts/brain-ingest.ts --vault /chemin/coffre # + régénère & pousse le vault
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { extractDriveFileId } from '../lib/process/drive-url';
import { ficheToBrainNote, slugify, wikilink } from '../lib/brain/note';
import type { BrainNote, NoteAnalysis } from '../lib/brain/types';
import type { FinalizedFiche } from '../lib/process/types';

config({ path: resolve(process.cwd(), '.env.local') });

// ---------------------------------------------------------------- pg-meta
const BASE = (
  process.env.SUPAVIA_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, '');
const USER = process.env.SUPAVIA_DASHBOARD_USER;
const PASS = process.env.SUPAVIA_DASHBOARD_PASSWORD;
if (!BASE || !USER || !PASS)
  throw new Error('Env pg-meta manquant (SUPABASE_URL + SUPAVIA_DASHBOARD_*).');
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const PGMETA = `${BASE}/api/platform/pg-meta/default/query`;

async function pg<T>(sql: string): Promise<T[]> {
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

const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a: string[]) =>
  a.length ? `ARRAY[${a.map(lit).join(',')}]::text[]` : `ARRAY[]::text[]`;

async function upsertNote(note: BrainNote): Promise<void> {
  await pg(`insert into public.brain_notes
    (path, type, title, aliases, tags, links, body, frontmatter, source_ref, source_hash, updated_at)
    values (${lit(note.path)}, ${lit(note.type)}, ${lit(note.title)}, ${arr(note.aliases)},
      ${arr(note.tags)}, ${arr(note.links)}, ${lit(note.body)}, '{}'::jsonb,
      ${note.source_ref ? lit(note.source_ref) : 'null'},
      ${note.source_hash ? lit(note.source_hash) : 'null'}, now())
    on conflict (path) do update set
      title=excluded.title, aliases=excluded.aliases, tags=excluded.tags, links=excluded.links,
      body=excluded.body, source_ref=excluded.source_ref, source_hash=excluded.source_hash,
      updated_at=now();`);
}

// ---------------------------------------------------------------- analyse (Max)
const SCHEMA_INSTRUCTION = `Renvoie UNIQUEMENT un objet JSON valide (aucun texte, aucune balise autour), de la forme :
{"title": string (<=120), "summary": string (2-4 phrases, <=600), "key_points": string[] (<=12), "entities": string[] (<=15, OPCO/tickets/missions/outils/livrables cités), "aliases": string[] (<=6, synonymes de recherche), "tags": string[] (<=8, courts)}
En français. Synthétise, n'invente rien.`;

function parseAnalysis(raw: string): NoteAnalysis {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Réponse Claude sans JSON : ${raw.slice(0, 200)}`);
  const o = JSON.parse(m[0]) as Partial<NoteAnalysis>;
  const asArr = (v: unknown, n: number) =>
    (Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : []
    ).slice(0, n);
  return {
    title: String(o.title ?? '').slice(0, 120) || 'Sans titre',
    summary: String(o.summary ?? '').slice(0, 600),
    key_points: asArr(o.key_points, 12),
    entities: asArr(o.entities, 15),
    aliases: asArr(o.aliases, 6),
    tags: asArr(o.tags, 8),
  };
}

/** Analyse via `claude -p`. `fileRef` = mention @chemin (livrable) ; sinon texte embarqué. */
function analyze(context: string, fileRef?: string): NoteAnalysis {
  const prompt = fileRef
    ? `Analyse le document ${fileRef} pour une base de connaissance de process internes.\n${SCHEMA_INSTRUCTION}`
    : `Analyse ce process interne pour une base de connaissance :\n\n${context}\n\n${SCHEMA_INSTRUCTION}`;
  const out = execFileSync('claude', ['-p', prompt], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return parseAnalysis(out);
}

// ---------------------------------------------------------------- livrables
const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/html': 'html',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

interface DownloadedFile {
  path: string;
  hash: string;
}

/** Télécharge un livrable Drive dans un fichier temporaire. null si non récupérable (415…). */
async function downloadDeliverable(
  fileId: string,
  dir: string,
): Promise<DownloadedFile | null> {
  // Import dynamique : `lib/process/drive` charge `lib/env` (validation stricte)
  // — on le diffère APRÈS le chargement de `.env.local` par dotenv.
  const { fetchDriveFile } = await import('../lib/process/drive');
  const res = await fetchDriveFile(fileId);
  if (res.status !== 200 || !res.body) return null;
  const base = res.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = EXT[base] ?? 'bin';
  const bytes = Buffer.from(await new Response(res.body).arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path = join(dir, `${fileId}.${ext}`);
  writeFileSync(path, bytes);
  return { path, hash };
}

function livrableToBrainNote(
  fileId: string,
  parentFichePath: string,
  analysis: NoteAnalysis,
  sourceHash: string,
): BrainNote {
  const entityLinks = analysis.entities.map((e) => `entites/${slugify(e)}`);
  const links = [
    ...new Set([...entityLinks, parentFichePath.replace(/\.md$/, '')]),
  ];
  const body = [
    `# ${analysis.title}`,
    '',
    `**Résumé.** ${analysis.summary}`,
    '',
    '## Points clés',
    analysis.key_points.map((p) => `- ${p}`).join('\n') || '- (aucun)',
    ...(entityLinks.length
      ? ['', '## Entités', entityLinks.map(wikilink).join(' · ')]
      : []),
    '',
    `## Source`,
    `Livrable Drive · [ouvrir](https://drive.google.com/file/d/${fileId}/view)`,
  ].join('\n');
  return {
    path: `livrables/${fileId}.md`,
    type: 'livrable',
    title: analysis.title,
    aliases: analysis.aliases,
    tags: analysis.tags,
    links,
    body,
    frontmatter: {},
    source_ref: fileId,
    source_hash: sourceHash,
  };
}

// ---------------------------------------------------------------- main
interface IndexRow {
  source_fiche_id: string;
  mission_code: string;
  mission_nom: string;
  fiche_code: string;
  titre: string;
  contenu: string;
  content_hash: string;
  detail: FinalizedFiche['detail'];
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const fichesOnly = args.has('--fiches-only');
  const vaultIdx = process.argv.indexOf('--vault');
  const vaultDir = vaultIdx >= 0 ? process.argv[vaultIdx + 1] : undefined;

  // Drive configuré ? Sinon on ingère les fiches et on ignore les livrables
  // (au lieu de planter au premier téléchargement).
  let driveOk = false;
  if (!fichesOnly) {
    const { driveConfigured } = await import('../lib/process/drive');
    driveOk = driveConfigured();
    if (!driveOk)
      console.log(
        '⚠ GOOGLE_SERVICE_ACCOUNT_KEY absent → livrables ignorés (fiches seulement).',
      );
  }

  const seenRows = await pg<{ source_ref: string; source_hash: string }>(
    `select source_ref, source_hash from public.brain_notes where source_ref is not null`,
  );
  const seen = new Map(seenRows.map((r) => [r.source_ref, r.source_hash]));

  const fiches = await pg<IndexRow>(
    `select source_fiche_id, mission_code, mission_nom, fiche_code, titre, contenu, content_hash, detail
     from public.process_index order by fiche_code`,
  );

  let analyzedFiches = 0;
  let analyzedDeliverables = 0;
  let skipped = 0;
  const tmp = mkdtempSync(join(tmpdir(), 'brain-ingest-'));
  try {
    for (const row of fiches) {
      const fichePath = `fiches/${slugify(`${row.mission_nom}-${row.fiche_code}`)}.md`;
      // --- fiche ---
      if (seen.get(row.source_fiche_id) === row.content_hash) {
        skipped++;
      } else if (dryRun) {
        console.log(`fiche À INGÉRER  ${row.fiche_code} — ${row.titre}`);
        analyzedFiches++;
      } else {
        const fiche = {
          fiche_id: row.source_fiche_id,
          mission_code: row.mission_code,
          mission_nom: row.mission_nom,
          fiche_code: row.fiche_code,
          titre: row.titre,
          priorite: null,
          contenu: row.contenu,
          content_hash: row.content_hash,
          detail: row.detail,
          detail_hash: '',
        } satisfies FinalizedFiche;
        const analysis = analyze(
          `Fiche ${row.fiche_code} — ${row.titre} (mission ${row.mission_nom}) :\n\n${row.contenu.slice(0, 12000)}`,
        );
        await upsertNote(ficheToBrainNote(fiche, analysis));
        analyzedFiches++;
        console.log(`✓ fiche ${row.fiche_code}`);
      }

      // --- livrables de la fiche ---
      if (fichesOnly || !driveOk) continue;
      const fileIds = [
        ...new Set(
          (row.detail?.taches ?? [])
            .flatMap((t) => t.liens ?? [])
            .map((l) => extractDriveFileId(l.url))
            .filter((id): id is string => !!id),
        ),
      ];
      for (const fileId of fileIds) {
        if (dryRun) {
          console.log(`  livrable À TENTER ${fileId}`);
          continue;
        }
        const dl = await downloadDeliverable(fileId, tmp);
        if (!dl) {
          console.log(`  livrable ignoré (non récupérable) ${fileId}`);
          continue;
        }
        if (seen.get(fileId) === dl.hash) {
          skipped++;
          continue;
        }
        try {
          const analysis = analyze('', `@${dl.path}`);
          await upsertNote(
            livrableToBrainNote(fileId, fichePath, analysis, dl.hash),
          );
          analyzedDeliverables++;
          console.log(`  ✓ livrable ${fileId}`);
        } catch (e) {
          console.error(
            `  ✗ livrable ${fileId} : ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(
    `\nFiches: ${analyzedFiches} · Livrables: ${analyzedDeliverables} · Inchangés: ${skipped}`,
  );

  if (vaultDir && !dryRun) {
    console.log(`\nRégénération du coffre ${vaultDir}…`);
    execFileSync('tsx', ['scripts/brain-vault-sync.ts', vaultDir], {
      stdio: 'inherit',
    });
    try {
      execFileSync('git', ['-C', vaultDir, 'add', '-A']);
      execFileSync(
        'git',
        ['-C', vaultDir, 'commit', '-m', 'brain: ingestion'],
        {
          stdio: 'inherit',
        },
      );
      execFileSync('git', ['-C', vaultDir, 'push'], { stdio: 'inherit' });
    } catch {
      console.log('(rien à pousser ou dépôt non configuré)');
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
