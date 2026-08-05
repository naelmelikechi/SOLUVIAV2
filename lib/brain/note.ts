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
    source_ref: `entite:${slug}`,
    source_hash: sourceHash,
  };
}
