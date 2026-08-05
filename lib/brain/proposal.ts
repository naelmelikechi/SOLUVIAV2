import { createHash } from 'node:crypto';
import type { BrainNote } from './types';
import { conversationPath, definitionDepuisCorps, wikilink } from './note';

export type ProposalKind =
  | 'conversation'
  | 'entite'
  | 'lacune'
  | 'obsolescence';
export type ProposalStatus =
  | 'en_attente'
  | 'approuvee'
  | 'rejetee'
  | 'a_regenerer';

export interface BrainProposal {
  kind: ProposalKind;
  target_path: string | null;
  payload: Record<string, unknown>;
  source_ref: string;
  source_hash: string;
}

/**
 * Clé d'unicité d'une proposition, image de la contrainte `unique (kind, source_ref)`.
 * Producteur et consommateur DOIVENT passer par ici : la clé a déjà divergé une
 * fois (`source_ref` des entités valant déjà `entite:<slug>`, la concaténation
 * manuelle produisait `entite:entite:<slug>` et le garde ne mordait jamais). Pur.
 */
export function proposalKey(kind: ProposalKind, sourceRef: string): string {
  return `${kind}:${sourceRef}`;
}

/**
 * Décide quoi faire d'une proposition face à ce qui existe déjà en base. Pur.
 *
 * `skip` sur hash identique quel que soit le statut : un rejet est DURABLE, on
 * ne repropose pas le même contenu à chaque run. `reopen` dès que le hash change :
 * le contenu refusé n'est plus celui qu'on propose, l'admin doit re-arbitrer.
 * Exception : `a_regenerer` reste `skip` même si le hash change. Ce statut est
 * posé par un admin pour demander une régénération que le script consomme en
 * fin de run ; un `reopen` prématuré le repasserait en `en_attente` et
 * effacerait la demande sans trace.
 */
export function shouldPropose(
  next: BrainProposal,
  existing: { status: ProposalStatus; source_hash: string } | null,
): 'skip' | 'insert' | 'reopen' {
  if (!existing) return 'insert';
  if (existing.source_hash === next.source_hash) return 'skip';
  if (existing.status === 'a_regenerer') return 'skip';
  return 'reopen';
}

/**
 * Proposition à partir d'une note dérivée déjà construite. `kind` est dérivé de
 * `note.type` : seuls `conversation` et `entite` passent par la validation — les
 * notes fiche/livrable/document reflètent des sources de vérité et sont écrites
 * en direct. Pur.
 */
export function noteToProposal(note: BrainNote): BrainProposal {
  if (note.type !== 'conversation' && note.type !== 'entite') {
    throw new Error(`type non proposable : ${note.type}`);
  }
  if (!note.source_hash) {
    throw new Error(`note sans source_hash : ${note.path}`);
  }
  if (!note.source_ref) {
    throw new Error(`note sans source_ref : ${note.path}`);
  }
  return {
    kind: note.type,
    target_path: note.path,
    payload: note as unknown as Record<string, unknown>,
    source_ref: note.source_ref,
    source_hash: note.source_hash,
  };
}

/**
 * payload d'une proposition → note prête à upsert. `editedBody` = corps corrigé
 * par l'admin dans la page de revue : absent, on garde le corps proposé ; défini
 * mais blanc après trim, on lève — un admin qui vide le champ dit « ce texte ne
 * convient pas », republier le texte de l'IA serait le pire mode de défaillance
 * pour une boucle de contrôle humain. Ne concerne que `conversation` et `entite`,
 * dont le payload EST une note : `lacune` passe par `gapToBrainNote`, et
 * `obsolescence` ne produit pas de note (arbitrage sur une note existante).
 *
 * `payload` est une colonne jsonb libre écrite par le script (potentiellement
 * une version antérieure) : on vérifie qu'elle porte un `path` exploitable et
 * que son `type` correspond au `kind` de la proposition avant de la bénir en
 * `BrainNote`.
 *
 * Quand un corps édité est fourni, `links` et `frontmatter.source_hashes` sont
 * re-dérivés de ce corps (les wikilinks qu'il cite réellement) — sinon un lien
 * retiré par l'admin resterait dans `links`, l'expansion de graphe le suivrait
 * quand même, et `markStaleConversations` marquerait la note obsolète pour une
 * source qu'elle ne cite plus. Le titre, lui, n'est PAS re-dérivé du corps :
 * c'est la question posée, pas le titre markdown.
 *
 * Pour un `entite`, `frontmatter.definition` est re-dérivé du corps édité par la
 * règle partagée `definitionDepuisCorps`. Sans cela la copie structurée resterait
 * au texte proposé par Claude, et la réécriture mécanique des backlinks (qui lit
 * le frontmatter EN PRIORITÉ sur le corps) écraserait la correction de l'admin au
 * run suivant — sans proposition, sans trace, sans clic. Corps édité sans
 * définition lisible → la clé est retirée, comme le fait `entityToBrainNote` :
 * frontmatter et corps disent alors la même chose, à savoir rien. Pur.
 */
export function applyProposal(
  p: BrainProposal,
  editedBody?: string,
): BrainNote {
  if (p.kind !== 'conversation' && p.kind !== 'entite') {
    throw new Error(`proposition non applicable directement : ${p.kind}`);
  }
  const note = p.payload as unknown as BrainNote;
  if (typeof note.path !== 'string' || !note.path) {
    throw new Error('payload sans path exploitable');
  }
  if (note.type !== p.kind) {
    throw new Error(
      `payload incohérent : type ${note.type} pour un kind ${p.kind}`,
    );
  }
  if (editedBody === undefined) return note;
  const body = editedBody.trim();
  if (!body) {
    throw new Error('corps vidé : rien à publier');
  }
  const liens = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map(
    (m) => m[1] as string,
  );
  const uniques = [...new Set(liens)];
  const hashes = Object.fromEntries(
    Object.entries(
      (note.frontmatter?.source_hashes ?? {}) as Record<string, string>,
    ).filter(([k]) => uniques.includes(k)),
  );
  const frontmatter: Record<string, unknown> = {
    ...note.frontmatter,
    derived_from: uniques,
    source_hashes: hashes,
  };
  if (p.kind === 'entite') {
    const definition = definitionDepuisCorps(body);
    if (definition) frontmatter.definition = definition;
    else delete frontmatter.definition;
  }
  return { ...note, body, links: uniques, frontmatter };
}

export interface GapInput {
  id: string;
  question: string;
  answer_ko: string;
}

/**
 * Lacune (👎) + réponse rédigée par un admin → note `conversation`. La mauvaise
 * réponse n'entre PAS dans la note : elle ne sert qu'à contextualiser l'arbitrage
 * dans la page de revue. Le path vient de `conversationPath`, partagé avec
 * `conversationToBrainNote` : l'upsert écrase donc une éventuelle note issue de
 * la même question, dans un sens comme dans l'autre. Pur.
 */
export function gapToBrainNote(
  gap: GapInput,
  humanAnswer: string,
  derivedFrom: string[],
  sourceHashes: Record<string, string>,
): BrainNote {
  const answer = humanAnswer.trim();
  if (!gap.question.trim()) throw new Error('lacune sans question');
  if (!answer) throw new Error('réponse vide : rien à capitaliser');
  const links = [...new Set(derivedFrom.map((p) => p.replace(/\.md$/, '')))];
  const body = [
    `# ${gap.question}`,
    '',
    "> Réponse rédigée et validée par un administrateur (correction d'une lacune 👎).",
    '',
    answer,
    ...(links.length
      ? ['', '## Sources', links.map(wikilink).join(' · ')]
      : []),
  ].join('\n');
  return {
    path: conversationPath(gap.question),
    type: 'conversation',
    title: gap.question,
    aliases: [],
    tags: ['faq'],
    links,
    body,
    frontmatter: {
      derived_from: links,
      source_hashes: sourceHashes,
      corrige: true,
    },
    source_ref: gap.id,
    source_hash: createHash('sha256')
      .update(`${gap.question}|${answer}`)
      .digest('hex'),
  };
}
