import { describe, it, expect } from 'vitest';
import {
  shouldPropose,
  noteToProposal,
  applyProposal,
  gapToBrainNote,
  proposalKey,
  type BrainProposal,
} from '@/lib/brain/proposal';
import {
  entityToBrainNote,
  entitySourceRef,
  definitionDepuisCorps,
} from '@/lib/brain/note';
import type { BrainNote } from '@/lib/brain/types';

const proposal: BrainProposal = {
  kind: 'conversation',
  target_path: 'conversations/comment-facturer.md',
  payload: { path: 'conversations/comment-facturer.md' },
  source_ref: 'feedback-1',
  source_hash: 'hash-a',
};

// Les trois statuts que du code peut encore poser. `a_regenerer` a disparu avec
// l'action « Régénérer » : plus rien ne l'écrit, `shouldPropose` n'a donc plus
// de règle à son sujet. (La contrainte `check` en base le tolère toujours ;
// aucune ligne ne le porte.)
const STATUTS = ['en_attente', 'approuvee', 'rejetee'] as const;

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

  it('rouvre sur contenu changé, quel que soit le statut', () => {
    for (const status of STATUTS) {
      expect(shouldPropose(proposal, { status, source_hash: 'hash-b' })).toBe(
        'reopen',
      );
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

  it('refuse une note sans source_ref', () => {
    // Même principe que source_hash : pas de repli sur note.path, qui changerait
    // silencieusement la clé d'idempotence (unique (kind, source_ref) en base).
    expect(() => noteToProposal({ ...note, source_ref: null })).toThrow(
      /source_ref/,
    );
  });
});

describe('proposalKey', () => {
  const entite = entityToBrainNote(
    'opco',
    'OPCO',
    ['fiches/a', 'fiches/b', 'fiches/c'],
    'Opérateur de compétences finançant la formation.',
    'ehash',
  );

  // Verrou d'accord producteur/consommateur. La clé a déjà divergé : le script
  // indexait `kind:source_ref` (soit `entite:entite:opco`, `source_ref` valant
  // déjà `entite:<slug>`) mais interrogeait sa map avec `entite:<slug>` —
  // jamais de correspondance, donc une définition REJETÉE redevenait candidate
  // à chaque run, était reformulée par Claude (nouveau hash), et `shouldPropose`
  // la rouvrait en effaçant motif et décideur.
  it("la clé d'une proposition d'entité passe par source_ref, sans re-préfixe", () => {
    const p = noteToProposal(entite);
    expect(p.source_ref).toBe('entite:opco');
    expect(proposalKey(p.kind, p.source_ref)).toBe('entite:entite:opco');
  });

  it('le consommateur reconstruit exactement la clé du producteur', () => {
    const p = noteToProposal(entite);
    // Ce que le filtre des candidats de brain-ingest interroge, à partir du
    // seul slug court dont il dispose.
    expect(proposalKey('entite', entitySourceRef('opco'))).toBe(
      proposalKey(p.kind, p.source_ref),
    );
    // Et la forme fautive historique n'est PAS la clé stockée.
    expect(proposalKey(p.kind, p.source_ref)).not.toBe('entite:opco');
  });

  it('discrimine les kinds partageant un source_ref', () => {
    expect(proposalKey('conversation', 'x')).not.toBe(
      proposalKey('obsolescence', 'x'),
    );
  });
});

describe('applyProposal', () => {
  it('rend la note du payload quand editedBody est absent', () => {
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

  it('refuse un payload dont le type ne correspond pas au kind', () => {
    const incoherente = noteToProposal(note);
    incoherente.payload = { ...note, type: 'entite' };
    expect(() => applyProposal(incoherente)).toThrow(/incohérent/);
  });

  it('refuse un corps édité vidé plutôt que de republier le texte proposé', () => {
    expect(() => applyProposal(noteToProposal(note), '   ')).toThrow(/vidé/);
  });

  // Sans cette re-dérivation, `frontmatter.definition` restait au texte de
  // Claude ; le run suivant relit ce frontmatter EN PRIORITÉ sur le corps et
  // republie l'ancienne formulation par-dessus la correction de l'admin.
  describe('entite : la définition corrigée survit au run suivant', () => {
    const originale = 'Opérateur de compétences finançant la formation.';
    const entite = entityToBrainNote(
      'opco',
      'OPCO',
      ['fiches/a', 'fiches/b'],
      originale,
      'ehash',
    );

    it('re-dérive frontmatter.definition depuis le corps édité', () => {
      const corrigee =
        "Opérateur de compétences agréé par l'État, qui finance les formations des entreprises adhérentes.";
      const applied = applyProposal(
        noteToProposal(entite),
        `# OPCO\n\n${corrigee}\n\n## Notes liées\n[[fiches/a]] · [[fiches/b]]`,
      );
      expect(applied.frontmatter.definition).toBe(corrigee);
      expect(applied.frontmatter.definition).not.toBe(originale);
      // La copie structurée doit dire exactement ce que dit le corps : c'est
      // cette égalité que la réécriture mécanique des backlinks suppose.
      expect(applied.frontmatter.definition).toBe(
        definitionDepuisCorps(applied.body),
      );
    });

    it('corps édité sans définition lisible : la clé est retirée', () => {
      const applied = applyProposal(
        noteToProposal(entite),
        '# OPCO\n\n## Notes liées\n[[fiches/a]]',
      );
      expect(applied.frontmatter.definition).toBeUndefined();
      expect('definition' in applied.frontmatter).toBe(false);
    });

    it('sans corps édité, la note du payload est rendue telle quelle', () => {
      expect(applyProposal(noteToProposal(entite)).frontmatter).toEqual({
        definition: originale,
      });
    });

    it('une conversation éditée ne se voit pas inventer de définition', () => {
      const applied = applyProposal(
        noteToProposal(note),
        '# Comment facturer un OPCO ?\n\nUn paragraphe.\n\n## Sources\n[[fiches/lancement-a-1]]',
      );
      expect('definition' in applied.frontmatter).toBe(false);
    });
  });

  it('corps édité : réaligne links et source_hashes', () => {
    const deuxLiens: BrainNote = {
      ...note,
      links: ['fiches/lancement-a-1', 'fiches/qualite-g-2'],
      frontmatter: {
        derived_from: ['fiches/lancement-a-1', 'fiches/qualite-g-2'],
        source_hashes: {
          'fiches/lancement-a-1': 'h1',
          'fiches/qualite-g-2': 'h2',
        },
      },
    };
    const applied = applyProposal(
      noteToProposal(deuxLiens),
      '# Comment facturer un OPCO ?\n\nRéponse. [[fiches/lancement-a-1]]',
    );
    expect(applied.links).toEqual(['fiches/lancement-a-1']);
    expect(applied.frontmatter.source_hashes).toEqual({
      'fiches/lancement-a-1': 'h1',
    });
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
    expect(n.path).toMatch(
      /^conversations\/quel-delai-pour-transmettre-le-bpf-[0-9a-f]{8}\.md$/,
    );
    expect(n.title).toBe(gap.question);
    expect(n.body).toContain('Avant le 31 mai de chaque année.');
    expect(n.body).toContain('[[fiches/qualite-g-2]]');
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

  it('le hash dépend aussi de la question', () => {
    const a = gapToBrainNote(gap, 'Même réponse.', [], {}).source_hash;
    const b = gapToBrainNote(
      { ...gap, question: 'Une autre question ?' },
      'Même réponse.',
      [],
      {},
    ).source_hash;
    expect(a).not.toBe(b);
  });

  it('tronque le path des questions très longues', () => {
    const longue = { ...gap, question: 'a'.repeat(200) };
    const n = gapToBrainNote(longue, 'Réponse.', [], {});
    expect(n.path.length).toBeLessThanOrEqual(
      'conversations/'.length + 72 + 1 + 8 + 3,
    );
  });

  it('deux questions longues distinctes donnent deux paths distincts', () => {
    const a =
      "Quelles sont les modalités de prise en charge d'une formation par un OPCO pour un salarié en CDI ?";
    const b =
      "Quelles sont les modalités de prise en charge d'une formation par un OPCO pour un intérimaire ?";
    expect(gapToBrainNote({ ...gap, question: a }, 'R.', [], {}).path).not.toBe(
      gapToBrainNote({ ...gap, question: b }, 'R.', [], {}).path,
    );
  });

  it('la même question donne le même path (déduplication voulue)', () => {
    const p1 = gapToBrainNote(gap, 'Une réponse.', [], {}).path;
    const p2 = gapToBrainNote(gap, 'Une autre réponse.', [], {}).path;
    expect(p1).toBe(p2);
  });

  it('refuse une lacune sans question', () => {
    expect(() =>
      gapToBrainNote({ ...gap, question: '  ' }, 'R.', [], {}),
    ).toThrow(/question/);
  });

  it('refuse une réponse vide', () => {
    expect(() => gapToBrainNote(gap, '   ', [], {})).toThrow(/vide/);
  });
});
