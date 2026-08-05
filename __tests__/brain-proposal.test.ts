import { describe, it, expect } from 'vitest';
import {
  shouldPropose,
  noteToProposal,
  applyProposal,
  type BrainProposal,
} from '@/lib/brain/proposal';
import type { BrainNote } from '@/lib/brain/types';

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

const note: BrainNote = {
  path: 'conversations/comment-facturer.md',
  type: 'conversation',
  title: 'Comment facturer un OPCO ?',
  aliases: [],
  tags: ['faq'],
  links: ['fiches/lancement-a-1'],
  body: '# Comment facturer un OPCO ?\n\nRéponse.',
  frontmatter: { derived_from: ['fiches/lancement-a-1'] },
  source_ref: 'feedback-1',
  source_hash: 'hash-qa',
};

describe('noteToProposal', () => {
  it('construit une proposition à partir de la note', () => {
    const p = noteToProposal(note);
    expect(p.kind).toBe('conversation');
    expect(p.target_path).toBe('conversations/comment-facturer.md');
    expect(p.source_ref).toBe('feedback-1');
    expect(p.source_hash).toBe('hash-qa');
  });

  it('refuse un type non dérivé', () => {
    expect(() => noteToProposal({ ...note, type: 'fiche' })).toThrow(
      /non proposable/,
    );
  });

  it('refuse une note sans source_hash', () => {
    // Pas de repli silencieux : tous les constructeurs de notes renseignent
    // source_hash. Une note sans hash est un bug d'appelant, pas un cas normal —
    // un repli inventerait un hash qui ne suivrait pas la source.
    expect(() => noteToProposal({ ...note, source_hash: null })).toThrow(
      /source_hash/,
    );
  });
});

describe('applyProposal', () => {
  it('rend la note du payload', () => {
    expect(applyProposal(noteToProposal(note))).toEqual(note);
  });

  it('remplace le corps quand l admin a édité', () => {
    const applied = applyProposal(
      noteToProposal(note),
      '  # Corrigé\n\nMieux.  ',
    );
    expect(applied.body).toBe('# Corrigé\n\nMieux.');
    expect(applied.title).toBe('Comment facturer un OPCO ?');
  });

  it('refuse une proposition qui ne porte pas de note', () => {
    const lacune = { ...noteToProposal(note), kind: 'lacune' as const };
    expect(() => applyProposal(lacune)).toThrow(/non applicable/);
  });
});
