import { describe, it, expect } from 'vitest';
import {
  shouldPropose,
  noteToProposal,
  applyProposal,
  gapToBrainNote,
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

describe('gapToBrainNote', () => {
  const gap = {
    id: 'feedback-9',
    question: 'Quel délai pour transmettre le BPF ?',
    answer_ko: 'Je ne trouve pas cette information.',
  };

  it('construit une note conversation depuis la réponse humaine', () => {
    const n = gapToBrainNote(
      gap,
      '  Avant le 31 mai de chaque année.  ',
      ['fiches/qualite-g-2'],
      { 'fiches/qualite-g-2': 'h1' },
    );
    expect(n.type).toBe('conversation');
    expect(n.path).toBe('conversations/quel-delai-pour-transmettre-le-bpf.md');
    expect(n.title).toBe(gap.question);
    expect(n.body).toContain('Avant le 31 mai de chaque année.');
    expect(n.body).toContain('[[fiches/qualite-g-2]]');
    expect(n.body).not.toContain('Je ne trouve pas');
    expect(n.links).toEqual(['fiches/qualite-g-2']);
    expect(n.frontmatter).toMatchObject({
      derived_from: ['fiches/qualite-g-2'],
      source_hashes: { 'fiches/qualite-g-2': 'h1' },
      corrige: true,
    });
    expect(n.source_ref).toBe('feedback-9');
  });

  it('hash stable et sensible à la réponse', () => {
    const a = gapToBrainNote(gap, 'Avant le 31 mai.', [], {});
    const b = gapToBrainNote(gap, 'Avant le 31 mai.', [], {});
    const c = gapToBrainNote(gap, 'Avant le 30 juin.', [], {});
    expect(a.source_hash).toBe(b.source_hash);
    expect(a.source_hash).not.toBe(c.source_hash);
  });

  it('tronque le path des questions très longues', () => {
    const longue = { ...gap, question: 'a'.repeat(200) };
    const n = gapToBrainNote(longue, 'Réponse.', [], {});
    expect(n.path.length).toBeLessThanOrEqual('conversations/'.length + 80 + 3);
  });
});
