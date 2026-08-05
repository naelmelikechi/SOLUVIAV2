import { describe, it, expect } from 'vitest';
import { shouldPropose, type BrainProposal } from '@/lib/brain/proposal';

const proposal: BrainProposal = {
  kind: 'conversation',
  status: 'en_attente',
  target_path: 'conversations/comment-facturer.md',
  payload: { path: 'conversations/comment-facturer.md' },
  source_ref: 'feedback-1',
  source_hash: 'hash-a',
};

describe('shouldPropose', () => {
  it('insère quand rien n existe', () => {
    expect(shouldPropose(proposal, null)).toBe('insert');
  });

  it('ignore un contenu inchangé, quel que soit le statut', () => {
    for (const status of [
      'en_attente',
      'approuvee',
      'rejetee',
      'a_regenerer',
    ] as const) {
      expect(shouldPropose(proposal, { status, source_hash: 'hash-a' })).toBe(
        'skip',
      );
    }
  });

  it('rouvre une proposition rejetée dont le contenu a changé', () => {
    expect(
      shouldPropose(proposal, { status: 'rejetee', source_hash: 'hash-b' }),
    ).toBe('reopen');
  });

  it('rouvre aussi une proposition déjà approuvée dont la source a changé', () => {
    expect(
      shouldPropose(proposal, { status: 'approuvee', source_hash: 'hash-b' }),
    ).toBe('reopen');
  });
});
