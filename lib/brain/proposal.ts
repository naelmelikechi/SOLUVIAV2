import type { BrainNote } from './types';

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
  return {
    kind: note.type,
    target_path: note.path,
    payload: note as unknown as Record<string, unknown>,
    source_ref: note.source_ref ?? note.path,
    source_hash: note.source_hash,
  };
}

/**
 * payload d'une proposition → note prête à upsert. `editedBody` = corps corrigé
 * par l'admin dans la page de revue. Ne concerne que `conversation` et `entite`,
 * dont le payload EST une note : `lacune` passe par `gapToBrainNote`, et
 * `obsolescence` ne produit pas de note (arbitrage sur une note existante). Pur.
 */
export function applyProposal(
  p: BrainProposal,
  editedBody?: string,
): BrainNote {
  if (p.kind !== 'conversation' && p.kind !== 'entite') {
    throw new Error(`proposition non applicable directement : ${p.kind}`);
  }
  const note = p.payload as unknown as BrainNote;
  const body = editedBody?.trim();
  return body ? { ...note, body } : note;
}
