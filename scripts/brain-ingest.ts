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
import {
  ficheToBrainNote,
  slugify,
  wikilink,
  isNonAnswer,
  conversationPath,
  conversationToBrainNote,
  entityToBrainNote,
  entitySourceRef,
  definitionDepuisCorps,
} from '../lib/brain/note';
import {
  shouldPropose,
  noteToProposal,
  proposalKey,
  type BrainProposal,
  type ProposalKind,
  type ProposalStatus,
} from '../lib/brain/proposal';
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
      ${arr(note.tags)}, ${arr(note.links)}, ${lit(note.body)},
      ${lit(JSON.stringify(note.frontmatter ?? {}))}::jsonb,
      ${note.source_ref ? lit(note.source_ref) : 'null'},
      ${note.source_hash ? lit(note.source_hash) : 'null'}, now())
    on conflict (path) do update set
      title=excluded.title, aliases=excluded.aliases, tags=excluded.tags, links=excluded.links,
      body=excluded.body, frontmatter=excluded.frontmatter, source_ref=excluded.source_ref,
      source_hash=excluded.source_hash, updated_at=now();`);
}

// ---------------------------------------------------------------- propositions
// Nom distinct de `ProposalRow` (lib/queries/brain-proposals.ts), qui porte la
// ligne complète pour l'UI : ici on ne lit que de quoi décider.
interface ProposalState {
  kind: ProposalKind;
  source_ref: string;
  status: ProposalStatus;
  source_hash: string;
}

/** État des propositions déjà en base, indexé par `proposalKey`. */
async function loadProposals(): Promise<Map<string, ProposalState>> {
  const rows = await pg<ProposalState>(
    `select kind, source_ref, status, source_hash from public.brain_proposals`,
  );
  return new Map(rows.map((r) => [proposalKey(r.kind, r.source_ref), r]));
}

/**
 * Dépose (ou rouvre) une proposition. Renvoie true si quelque chose a été écrit.
 * `shouldPropose` garantit qu'un rejet reste durable tant que le contenu ne bouge pas.
 */
async function proposeNote(
  p: BrainProposal,
  known: Map<string, ProposalState>,
  dryRun: boolean,
): Promise<boolean> {
  const existing = known.get(proposalKey(p.kind, p.source_ref)) ?? null;
  const verdict = shouldPropose(p, existing);
  if (verdict === 'skip') return false;
  if (dryRun) {
    console.log(
      `  proposition (${verdict}) ${p.kind} : ${p.target_path ?? p.source_ref}`,
    );
    return true;
  }
  await pg(`insert into public.brain_proposals
    (kind, status, target_path, payload, source_ref, source_hash)
    values (${lit(p.kind)}, 'en_attente', ${p.target_path ? lit(p.target_path) : 'null'},
            ${lit(JSON.stringify(p.payload))}::jsonb, ${lit(p.source_ref)}, ${lit(p.source_hash)})
    on conflict (kind, source_ref) do update set
      status = 'en_attente',
      target_path = excluded.target_path,
      payload = excluded.payload,
      source_hash = excluded.source_hash,
      reason = null,
      decided_by = null,
      decided_at = null;`);
  return true;
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

// ---------------------------------------------------------------- Phase 3
/** Une entité citée par moins de 3 notes ne justifie pas de mobiliser un arbitrage humain. */
const SEUIL_DEFINITION = 3;

/** Au-delà, un seul appel Claude devient fragile (troncature = lot entier perdu)
 *  et la file de validation devient inexploitable. Le reste suivra au prochain run. */
const MAX_DEFINITIONS_PAR_RUN = 40;

const titleCase = (s: string) =>
  s
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

interface NoteRow {
  path: string;
  type: string;
  links: string[];
  source_ref: string | null;
  source_hash: string | null;
  frontmatter: {
    source_hashes?: Record<string, string>;
    stale?: boolean;
    definition?: string;
  } | null;
  body?: string;
  title?: string;
}

/** Propose les réponses validées (👍) comme notes `conversation` à arbitrer. */
async function ingestConversations(dryRun: boolean): Promise<number> {
  const known = await loadProposals();
  const corrigees = new Set(
    (
      await pg<{ path: string }>(
        `select path from public.brain_notes
         where type = 'conversation' and frontmatter->>'corrige' = 'true'`,
      )
    ).map((r) => r.path),
  );
  const fb = await pg<{
    id: string;
    question: string;
    answer: string;
    sources: Array<{ source_fiche_id?: string }>;
  }>(
    `select id, question, answer, coalesce(sources,'[]'::jsonb) as sources
     from public.process_qa_feedback where rating = 1`,
  );
  const notes = await pg<NoteRow>(
    `select path, source_ref, source_hash from public.brain_notes where source_ref is not null`,
  );
  const byRef = new Map(notes.map((n) => [n.source_ref!, n]));

  let n = 0;
  for (const f of fb) {
    if (isNonAnswer(f.answer)) continue;
    // L'idempotence est portée par `shouldPropose` face à `brain_proposals` :
    // une conversation non encore approuvée n'est PAS dans `brain_notes`.
    const qaHash = createHash('sha256')
      .update(`${f.question}|${f.answer}`)
      .digest('hex');

    const derivedFrom: string[] = [];
    const sourceHashes: Record<string, string> = {};
    for (const s of f.sources ?? []) {
      const note = s.source_fiche_id ? byRef.get(s.source_fiche_id) : undefined;
      if (note) {
        const key = note.path.replace(/\.md$/, '');
        derivedFrom.push(key);
        if (note.source_hash) sourceHashes[key] = note.source_hash;
      }
    }
    // Une réponse rédigée par un admin fait autorité sur une paraphrase de
    // l'assistant : on ne repropose pas la même question par-dessus.
    if (corrigees.has(conversationPath(f.question))) continue;

    const note = conversationToBrainNote(
      { id: f.id, question: f.question, answer: f.answer },
      derivedFrom,
      qaHash,
      sourceHashes,
    );
    if (await proposeNote(noteToProposal(note), known, dryRun)) n++;
  }
  return n;
}

/** Définitions d'entités batchées via `claude -p` (best-effort). */
function entityDefinitions(
  shortSlugs: string[],
): Record<string, { name: string; definition: string }> {
  try {
    const prompt = `Contexte : process internes d'un organisme de formation français (SOLUVIA).
Pour chaque identifiant d'entité ci-dessous, donne un nom d'affichage propre et une définition d'UNE phrase, en français.
Identifiants : ${shortSlugs.join(', ')}.
Renvoie UNIQUEMENT un JSON : {"<identifiant>": {"name": "...", "definition": "..."}, ...}`;
    const out = execFileSync('claude', ['-p', prompt], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const m = out.match(/\{[\s\S]*\}/);
    return m
      ? (JSON.parse(m[0]) as Record<
          string,
          { name: string; definition: string }
        >)
      : {};
  } catch {
    return {};
  }
}

/**
 * Définition portée par une note `entite` existante. `frontmatter.definition`
 * fait foi ; à défaut on la relit dans le corps, pour les notes écrites avant
 * que la définition ne soit persistée en frontmatter. Sans ce repli, la
 * réécriture mécanique des backlinks effacerait une définition déjà validée.
 */
function definitionExistante(note: NoteRow | undefined): string {
  const fm = note?.frontmatter?.definition;
  if (typeof fm === 'string' && fm.trim()) return fm.trim();
  return definitionDepuisCorps(note?.body ?? '');
}

/**
 * Vrai si la note porte des sections rédigées à la main (autres que « Notes
 * liées »). `entityToBrainNote` ne sait pas les reconstruire : les réécrire
 * mécaniquement les supprimerait.
 */
function estCuree(note: NoteRow | undefined): boolean {
  return /\n## (?!Notes liées)/.test(note?.body ?? '');
}

/**
 * Entités : deux chemins distincts.
 *
 * 1. Toute entité citée reçoit sa note EN DIRECT, sans définition et sans
 *    arbitrage : une note-carrefour sans définition n'invente rien, son contenu
 *    se déduit mécaniquement des notes qui la citent. Son `source_hash` porte
 *    les backlinks — on veut justement qu'elle se rafraîchisse quand le graphe
 *    bouge.
 * 2. Seule la DÉFINITION est soumise à l'humain, et seulement là où elle sert :
 *    entité citée au moins `SEUIL_DEFINITION` fois, sans définition, et sans
 *    proposition existante quel que soit son statut (sinon un rejet se
 *    rouvrirait à chaque exécution, la définition étant reformulée par Claude).
 */
async function ingestEntities(dryRun: boolean): Promise<number> {
  const notes = await pg<NoteRow>(
    `select path, type, links from public.brain_notes`,
  );
  const entites = await pg<NoteRow>(
    `select path, type, links, title, body, frontmatter, source_hash
     from public.brain_notes where type = 'entite'`,
  );
  const parPath = new Map(entites.map((e) => [e.path, e]));
  const backlinks = new Map<string, string[]>();
  for (const note of notes) {
    for (const l of note.links ?? []) {
      if (l.startsWith('entites/')) {
        const arr = backlinks.get(l) ?? [];
        arr.push(note.path.replace(/\.md$/, ''));
        backlinks.set(l, arr);
      }
    }
  }
  const citees = [...backlinks.keys()];
  if (!citees.length) return 0;

  // --- Chemin 1 : notes-carrefour écrites en direct (pas de Claude) ---
  let creees = 0;
  for (const link of citees) {
    const short = link.replace(/^entites\//, '');
    const bl = backlinks.get(link) ?? [];
    const existante = parPath.get(`${link}.md`);
    // Une note curée à la main n'est pas régénérable : on la laisse telle
    // quelle, sa section « Notes liées » se périmera plutôt que d'emporter le
    // travail éditorial. Compromis déjà retenu pour les entités approuvées.
    if (estCuree(existante)) continue;
    const hash = createHash('sha256').update(bl.join(',')).digest('hex');
    if (existante?.source_hash === hash) continue; // backlinks inchangés
    const note = entityToBrainNote(
      short,
      existante?.title || titleCase(short),
      bl,
      definitionExistante(existante),
      hash,
    );
    // Le frontmatter déjà posé sur la note (sources, verified…) ne doit pas
    // être emporté par une réécriture purement mécanique des backlinks.
    note.frontmatter = {
      ...(existante?.frontmatter ?? {}),
      ...note.frontmatter,
    };
    if (!dryRun) await upsertNote(note);
    creees++;
  }

  // --- Chemin 2 : la définition, elle, s'arbitre ---
  const known = await loadProposals();
  const tousCandidats = citees.filter((link) => {
    const short = link.replace(/^entites\//, '');
    if ((backlinks.get(link) ?? []).length < SEUIL_DEFINITION) return false;
    if (definitionExistante(parPath.get(`${link}.md`))) return false;
    // `entitySourceRef` : la clé interrogée ici DOIT être celle que
    // `entityToBrainNote` posera, sinon le garde ne mord jamais et une
    // définition rejetée se rouvre à chaque exécution.
    return !known.has(proposalKey('entite', entitySourceRef(short)));
  });
  const candidates = tousCandidats.slice(0, MAX_DEFINITIONS_PAR_RUN);
  const reportees = tousCandidats.length - candidates.length;

  let proposees = 0;
  if (candidates.length) {
    const defs = entityDefinitions(
      candidates.map((l) => l.replace(/^entites\//, '')),
    );
    for (const link of candidates) {
      const short = link.replace(/^entites\//, '');
      const d = defs[short];
      // Sans définition rendue par Claude il n'y a rien à arbitrer : proposer
      // du vide brûlerait le créneau (le filtre `known` ci-dessus l'exclurait
      // ensuite définitivement). L'entité reste candidate au prochain run.
      if (!d?.definition?.trim()) continue;
      const nom = d.name || titleCase(short);
      // Le hash ne porte que ce que l'admin arbitre (nom + définition) : y
      // mettre les backlinks ferait réapparaître une entité rejetée dès qu'une
      // nouvelle note la cite.
      const hash = createHash('sha256')
        .update(`${nom}|${d.definition.trim()}`)
        .digest('hex');
      const note = entityToBrainNote(
        short,
        nom,
        backlinks.get(link) ?? [],
        d.definition.trim(),
        hash,
      );
      if (await proposeNote(noteToProposal(note), known, dryRun)) proposees++;
    }
  }

  console.log(
    `  entités écrites en direct : ${creees} · définitions proposées : ${proposees}` +
      ` (candidates : ${tousCandidats.length}, traitées : ${candidates.length}` +
      `, reportées : ${reportees})`,
  );
  // Un plafond silencieux se lirait comme « tout est couvert » : on dit
  // explicitement ce qui reste, et qu'un run suivant le reprendra.
  if (reportees)
    console.log(
      `  ⚠ plafond ${MAX_DEFINITIONS_PAR_RUN}/run : ${tousCandidats.length} candidates, ` +
        `${candidates.length} traitées, ${reportees} au prochain run.`,
    );
  return creees + proposees;
}

/** Marque `stale` les conversations dont une source a changé, et propose l'arbitrage. */
async function markStaleConversations(dryRun: boolean): Promise<number> {
  const known = await loadProposals();
  const notes = await pg<Required<NoteRow>>(
    `select path, type, links, source_ref, source_hash, frontmatter, body, title
     from public.brain_notes`,
  );
  const currentHash = new Map(
    notes.map((n) => [n.path.replace(/\.md$/, ''), n.source_hash]),
  );
  let n = 0;
  for (const note of notes.filter((x) => x.type === 'conversation')) {
    const sh = note.frontmatter?.source_hashes ?? {};
    // Les sources RÉELLEMENT divergentes, pas toutes celles de la note : c'est
    // cette liste que l'admin lit pour arbitrer, et lui servir l'ensemble des
    // sources ne lui apprend rien sur ce qui a bougé.
    const changed = Object.entries(sh)
      .filter(([p, h]) => currentHash.get(p) !== h)
      .map(([p]) => p);
    const already = note.frontmatter?.stale === true;
    if (!changed.length || already) continue;
    const marker = '> ⚠️ Réponse à revoir : une source a changé.\n\n';
    if (!dryRun) {
      await pg(
        `update public.brain_notes set
           frontmatter = frontmatter || '{"stale":true}'::jsonb,
           body = ${lit(marker + note.body)},
           updated_at = now()
         where path = ${lit(note.path)};`,
      );
    }
    await proposeNote(
      {
        kind: 'obsolescence',
        target_path: note.path,
        payload: {
          path: note.path,
          title: note.title,
          sources_modifiees: changed,
          // Le corps d'ORIGINE (sans la bannière « à revoir » ajoutée
          // ci-dessus) : le panneau d'arbitrage n'a aucun autre moyen de
          // montrer ce qu'on demande de garder ou d'archiver.
          body: note.body ?? '',
        },
        source_ref: note.path,
        source_hash: createHash('sha256')
          .update(JSON.stringify(sh))
          .digest('hex'),
      },
      known,
      dryRun,
    );
    n++;
  }
  return n;
}

/**
 * Ouvre les lacunes (👎) manquantes — rattrapage des échecs best-effort de la
 * route feedback — et écrit le rapport des lacunes ENCORE OUVERTES dans le coffre
 * (hors brain_notes → pas de bruit en recherche).
 */
async function syncGaps(
  vaultDir: string | null,
  dryRun: boolean,
): Promise<number> {
  const known = await loadProposals();
  const gaps = await pg<{ id: string; question: string; answer: string }>(
    `select id, question, answer from public.process_qa_feedback where rating = -1`,
  );
  for (const g of gaps) {
    await proposeNote(
      {
        kind: 'lacune',
        target_path: null,
        payload: {
          question: g.question,
          answer_ko: g.answer,
          derived_from: [],
          source_hashes: {},
        },
        source_ref: g.id,
        source_hash: createHash('sha256')
          .update(`${g.question}|${g.answer}`)
          .digest('hex'),
      },
      known,
      dryRun,
    );
  }

  const open = await pg<{ source_ref: string }>(
    `select source_ref from public.brain_proposals
     where kind = 'lacune' and status = 'en_attente'`,
  );
  const openIds = new Set(open.map((o) => o.source_ref));
  const encore = gaps.filter((g) => openIds.has(g.id));

  if (vaultDir && !dryRun) {
    const lines = [
      '# Lacunes du cerveau (retours 👎)',
      '',
      'Questions encore sans réponse satisfaisante — à combler depuis /admin/cerveau.',
      '',
    ];
    for (const g of encore)
      lines.push(
        `- **${g.question}**\n  > ${g.answer.replace(/\n/g, ' ').slice(0, 200)}`,
      );
    if (!encore.length) lines.push("_(aucune pour l'instant)_");
    writeFileSync(
      join(vaultDir, '_lacunes.md'),
      `${lines.join('\n')}\n`,
      'utf8',
    );
  }
  return encore.length;
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

  // --- Phase 3 : conversations (👍), entités (graphe), anti-obsolescence ---
  let conversations = 0;
  let entities = 0;
  let staled = 0;
  if (!fichesOnly) {
    conversations = await ingestConversations(dryRun);
    entities = await ingestEntities(dryRun);
    staled = await markStaleConversations(dryRun);
  }

  console.log(
    `\nFiches: ${analyzedFiches} · Livrables: ${analyzedDeliverables} · ` +
      `Conversations: ${conversations} · Entités: ${entities} · ` +
      `Stale: ${staled} · Inchangés: ${skipped}`,
  );

  if (vaultDir && !dryRun) {
    console.log(`\nRégénération du coffre ${vaultDir}…`);
    execFileSync('tsx', ['scripts/brain-vault-sync.ts', vaultDir], {
      stdio: 'inherit',
    });
  }

  // Rattrapage des lacunes (👎) : tourne même sans coffre.
  const gaps = await syncGaps(vaultDir ?? null, dryRun);
  console.log(`Lacunes ouvertes : ${gaps} question(s).`);

  if (vaultDir && !dryRun) {
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
