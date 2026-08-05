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
