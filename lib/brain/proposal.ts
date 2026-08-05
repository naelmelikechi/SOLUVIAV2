import { createHash } from 'node:crypto';
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
  status: ProposalStatus;
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
 */
export function shouldPropose(
  next: BrainProposal,
  existing: { status: ProposalStatus; source_hash: string } | null,
): 'skip' | 'insert' | 'reopen' {
  if (!existing) return 'insert';
  if (existing.source_hash === next.source_hash) return 'skip';
  return 'reopen';
}

/** Hash de repli quand la note ne porte pas de source_hash. Pur. */
export function hashNote(note: BrainNote): string {
  return createHash('sha256')
    .update(`${note.path}|${note.title}|${note.body}`)
    .digest('hex');
}
