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
