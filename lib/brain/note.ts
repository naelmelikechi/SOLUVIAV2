import { createHash } from 'node:crypto';
import type { BrainNote, BrainNoteType, NoteAnalysis } from './types';
import type { FinalizedFiche } from '@/lib/process/types';
import { extractDriveFileId } from '@/lib/process/drive-url';

const FOLDER: Record<BrainNoteType, string> = {
  fiche: 'fiches',
  livrable: 'livrables',
  conversation: 'conversations',
  entite: 'entites',
};

const NOTE_TYPES = Object.keys(FOLDER) as BrainNoteType[];

/**
 * Les seuls dossiers du coffre qu'écrit `brain-vault-sync`. Dérivé de `FOLDER`
 * pour qu'un nouveau type de note ne puisse pas créer un dossier que l'élagage
 * ignorerait (ses fichiers deviendraient alors des orphelins invisibles).
 * Tout le reste du coffre — sa racine (`_lacunes.md`, `README.md`),
 * `.obsidian/`, `.git/`, un dossier créé par l'utilisateur — est hors périmètre.
 */
export const NOTE_FOLDERS: readonly string[] = NOTE_TYPES.map((t) => FOLDER[t]);

/** Vrai si la valeur est un type de note connu (marque d'un fichier généré). Pur. */
export function estTypeDeNote(value: unknown): value is BrainNoteType {
  return typeof value === 'string' && (NOTE_TYPES as string[]).includes(value);
}

export function slugify(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'note';
}

export function notePath(type: BrainNoteType, key: string): string {
  return `${FOLDER[type]}/${slugify(key)}.md`;
}

/**
 * Path d'une note de conversation. Partagé par les deux constructeurs
 * (`conversationToBrainNote`, automatique, et `gapToBrainNote`, corrigé à la
 * main) : ils écrivent dans le MÊME espace de noms, où `path` est unique en
 * base. Si leur façon de fabriquer le path divergeait, deux notes cesseraient
 * de se dédupliquer là où elles le devaient, ou entreraient en collision
 * ailleurs — d'où une seule implémentation.
 *
 * Le suffixe de hash rend le path injectif : la troncature à 72 caractères
 * seule faisait collisionner deux questions distinctes partageant un préfixe.
 * Même question → même suffixe, donc la déduplication voulue est préservée. Pur.
 */
export function conversationPath(question: string): string {
  const empreinte = createHash('sha256')
    .update(question)
    .digest('hex')
    .slice(0, 8);
  return `conversations/${slugify(question).slice(0, 72)}-${empreinte}.md`;
}

export function linkTarget(path: string): string {
  return path.replace(/\.md$/, '');
}

export function wikilink(path: string): string {
  return `[[${linkTarget(path)}]]`;
}

function yamlList(items: string[]): string {
  return `[${items.map((s) => JSON.stringify(s)).join(', ')}]`;
}

export function buildMarkdown(note: BrainNote): string {
  const fm = [
    '---',
    `type: ${note.type}`,
    `title: ${JSON.stringify(note.title)}`,
    ...(note.source_ref
      ? [`source_ref: ${JSON.stringify(note.source_ref)}`]
      : []),
    `aliases: ${yamlList(note.aliases)}`,
    `tags: ${yamlList(note.tags)}`,
    `links: ${yamlList(note.links.map((l) => wikilink(l)))}`,
    '---',
  ];
  return `${fm.join('\n')}\n\n${note.body.trim()}\n`;
}

export function parseFrontmatter(md: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md.trim() };
  const fm: Record<string, unknown> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!kv || !kv[1]) continue;
    const raw = (kv[2] ?? '').trim();
    try {
      fm[kv[1]] = JSON.parse(raw);
    } catch {
      fm[kv[1]] = raw;
    }
  }
  return { frontmatter: fm, body: (m[2] ?? '').trim() };
}

/** Un `.md` trouvé sur disque dans le coffre. `path` est relatif à sa racine. */
export interface FichierCoffre {
  path: string;
  /** Contenu Markdown tel quel, frontmatter compris. */
  content: string;
}

function cheminNormalise(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Les fichiers du coffre qui ne correspondent plus à aucune note : notes
 * archivées (que le script n'écrit plus), anciens chemins de conversation
 * (avant le suffixe de hash de `conversationPath`), notes supprimées ou
 * renommées en base. Le coffre étant aussi édité à la main dans Obsidian,
 * trois conditions cumulatives sont exigées avant de déclarer un orphelin :
 *
 * 1. le fichier est dans un dossier de notes (`NOTE_FOLDERS`) — jamais la
 *    racine, ni `.obsidian/`, ni un dossier de l'utilisateur ;
 * 2. son frontmatter porte un `type` de note connu — la marque d'un fichier
 *    généré ; un `.md` écrit à la main dans `entites/` n'en a pas ;
 * 3. son chemin n'est pas dans `pathsConserves`.
 *
 * Garde-fou : une liste `pathsConserves` VIDE ne rend aucun orphelin. Sans lui,
 * une lecture de base en échec (ou revenue vide) ferait passer tout le coffre
 * pour obsolète et l'effacerait — exactement l'accident que l'élagage doit
 * rendre impossible. Pur.
 */
export function fichiersOrphelins(
  fichiers: readonly FichierCoffre[],
  pathsConserves: readonly string[],
): string[] {
  if (pathsConserves.length === 0) return [];
  const conserves = new Set(pathsConserves.map(cheminNormalise));
  const orphelins: string[] = [];
  for (const fichier of fichiers) {
    const path = cheminNormalise(fichier.path);
    if (!path.endsWith('.md')) continue;
    const dossier = path.split('/')[0];
    if (!dossier || !NOTE_FOLDERS.includes(dossier)) continue;
    if (conserves.has(path)) continue;
    if (!estTypeDeNote(parseFrontmatter(fichier.content).frontmatter.type))
      continue;
    orphelins.push(path);
  }
  return orphelins;
}

/** Corps Markdown d'une note de fiche, à partir de l'analyse Claude. Pur. */
function renderFicheBody(
  analysis: NoteAnalysis,
  entityLinks: string[],
): string {
  const points = analysis.key_points.map((p) => `- ${p}`).join('\n');
  const entites = entityLinks.map((l) => wikilink(l)).join(' · ');
  return [
    `# ${analysis.title}`,
    '',
    `**Résumé.** ${analysis.summary}`,
    '',
    '## Points clés',
    points || '- (aucun)',
    ...(entites ? ['', '## Entités', entites] : []),
  ].join('\n');
}

/** Construit la note-cerveau d'une fiche. Path stable (mission+code). Pur. */
export function ficheToBrainNote(
  fiche: FinalizedFiche,
  analysis: NoteAnalysis,
): BrainNote {
  const entityLinks = analysis.entities.map((e) => `entites/${slugify(e)}`);
  const deliverableLinks = fiche.detail.taches
    .flatMap((t) => t.liens)
    .map((l) => extractDriveFileId(l.url))
    .filter((id): id is string => !!id)
    .map((id) => `livrables/${id}`);
  const links = [...new Set([...entityLinks, ...deliverableLinks])];
  return {
    path: notePath('fiche', `${fiche.mission_nom}-${fiche.fiche_code}`),
    type: 'fiche',
    title: analysis.title,
    aliases: analysis.aliases,
    tags: analysis.tags,
    links,
    body: renderFicheBody(analysis, entityLinks),
    frontmatter: {},
    source_ref: fiche.fiche_id,
    source_hash: fiche.content_hash,
  };
}

// ---------------------------------------------------------------- Phase 3

/** Vrai si le texte est une non-réponse (à ne PAS capitaliser). Pur. */
export function isNonAnswer(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('je ne trouve pas') ||
    t.includes('aucune information') ||
    text.trim().length < 40
  );
}

export interface FeedbackInput {
  id: string;
  question: string;
  answer: string;
}

/**
 * Note `conversation` à partir d'une Q/R validée (👍). `derivedFrom` = paths des
 * notes sources (fiches/livrables) sans extension. `sourceHash` = hash de la Q/R
 * (idempotence). `sourceHashes` = hash courant de chaque source (anti-obsolescence). Pur.
 */
export function conversationToBrainNote(
  fb: FeedbackInput,
  derivedFrom: string[],
  sourceHash: string,
  sourceHashes: Record<string, string>,
): BrainNote {
  const links = [...new Set(derivedFrom.map((p) => p.replace(/\.md$/, '')))];
  const body = [
    `# ${fb.question}`,
    '',
    '> Réponse validée par un utilisateur (👍).',
    '',
    fb.answer.trim(),
    ...(links.length
      ? ['', '## Sources', links.map(wikilink).join(' · ')]
      : []),
  ].join('\n');
  return {
    path: conversationPath(fb.question),
    type: 'conversation',
    title: fb.question,
    aliases: [],
    tags: ['faq'],
    links,
    body,
    frontmatter: { derived_from: links, source_hashes: sourceHashes },
    source_ref: fb.id,
    source_hash: sourceHash,
  };
}

/**
 * `source_ref` d'une note d'entité. Producteur (`entityToBrainNote`) et
 * consommateurs (le filtre des candidats de `brain-ingest`) DOIVENT passer par
 * ici : la valeur a déjà divergé une fois, le script interrogeant sa map de
 * propositions avec `opco` là où la base porte `entite:opco`. Pur.
 */
export function entitySourceRef(slug: string): string {
  return `entite:${slug}`;
}

/**
 * Définition portée par le CORPS d'une note d'entité : le paragraphe qui suit
 * immédiatement le titre, avant la première section. C'est l'exacte réciproque
 * du corps rendu par `entityToBrainNote`.
 *
 * Règle unique, partagée par le script (qui relit une définition déjà publiée)
 * et par `applyProposal` (qui re-dérive `frontmatter.definition` d'un corps
 * édité par l'admin) : si les deux divergeaient, la copie en frontmatter
 * cesserait de refléter le corps, et la réécriture mécanique des backlinks
 * republierait l'ancien texte par-dessus la correction humaine. Pur.
 */
export function definitionDepuisCorps(body: string): string {
  const m = body.match(/^#[^\n]*\n\n(?!## )([\s\S]*?)\n\n## /);
  return m?.[1]?.trim() ?? '';
}

/**
 * Note `entite` (carrefour du graphe). `backlinks` = paths (sans extension) des
 * notes qui la référencent. `definition` optionnelle (peut venir de Claude).
 *
 * La définition est persistée dans le frontmatter en plus d'être rendue dans le
 * corps : la note est réécrite mécaniquement dès que les backlinks bougent, et
 * sans cette copie structurée la réécriture effacerait une définition validée
 * par un admin — le mode de défaillance exact que l'arbitrage existe pour
 * empêcher. Pur.
 */
export function entityToBrainNote(
  slug: string,
  name: string,
  backlinks: string[],
  definition: string,
  sourceHash: string,
): BrainNote {
  const uniq = [...new Set(backlinks)];
  const body = [
    `# ${name}`,
    ...(definition ? ['', definition] : []),
    '',
    '## Notes liées',
    uniq.length ? uniq.map(wikilink).join(' · ') : '(aucune)',
  ].join('\n');
  return {
    path: `entites/${slug}.md`,
    type: 'entite',
    title: name,
    aliases: [],
    tags: [],
    links: uniq,
    body,
    frontmatter: definition ? { definition } : {},
    source_ref: entitySourceRef(slug),
    source_hash: sourceHash,
  };
}
