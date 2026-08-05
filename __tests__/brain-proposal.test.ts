import { describe, it, expect } from 'vitest';
import { shouldPropose, type BrainProposal } from '@/lib/brain/proposal';

const proposal: BrainProposal = {
  kind: 'conversation',
  target_path: 'conversations/comment-facturer.md',
  payload: { path: 'conversations/comment-facturer.md' },
  source_ref: 'feedback-1',
  source_hash: 'hash-a',
};

const STATUTS = ['en_attente', 'approuvee', 'rejetee', 'a_regenerer'] as const;

describe('shouldPropose', () => {
  it('insère quand rien n existe', () => {
    expect(shouldPropose(proposal, null)).toBe('insert');
  });

  it('ignore un contenu inchangé, quel que soit le statut', () => {
    for (const status of STATUTS) {
      expect(shouldPropose(proposal, { status, source_hash: 'hash-a' })).toBe(
        'skip',
      );
    }
  });

  // `a_regenerer` fait exception : rouvrir écraserait la demande de
  // régénération posée par l'admin, sans log ni trace.
  it('rouvre sur contenu changé, sauf régénération en cours', () => {
    for (const status of STATUTS) {
      const verdict = shouldPropose(proposal, {
        status,
        source_hash: 'hash-b',
      });
      expect(verdict).toBe(status === 'a_regenerer' ? 'skip' : 'reopen');
    }
  });
});
