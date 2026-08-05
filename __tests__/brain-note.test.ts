import { describe, it, expect } from 'vitest';
import {
  slugify,
  notePath,
  wikilink,
  linkTarget,
  buildMarkdown,
  parseFrontmatter,
  ficheToBrainNote,
  isNonAnswer,
  conversationToBrainNote,
  entityToBrainNote,
  entitySourceRef,
  definitionDepuisCorps,
  fichiersOrphelins,
} from '@/lib/brain/note';
import type { BrainNote } from '@/lib/brain/types';
import type { FinalizedFiche } from '@/lib/process/types';

describe('slugify / notePath / wikilink', () => {
  it('slug ASCII minuscule', () => {
    expect(slugify('Cadrage de la Création (M0–M1)')).toBe(
      'cadrage-de-la-creation-m0-m1',
    );
    expect(slugify('   ')).toBe('note');
  });
  it('notePath place dans le bon dossier avec .md', () => {
    expect(notePath('fiche', 'Lancement A.1')).toBe('fiches/lancement-a-1.md');
    expect(notePath('entite', 'OPCO')).toBe('entites/opco.md');
  });
  it('linkTarget/wikilink retirent .md', () => {
    expect(linkTarget('entites/opco.md')).toBe('entites/opco');
    expect(wikilink('entites/opco.md')).toBe('[[entites/opco]]');
    expect(wikilink('entites/opco')).toBe('[[entites/opco]]');
  });
});

describe('buildMarkdown / parseFrontmatter', () => {
  const note: BrainNote = {
    path: 'fiches/lancement-a-1.md',
    type: 'fiche',
    title: 'Cadrage (M0–M1)',
    aliases: ['Cadrage', 'M0-M1'],
    tags: ['lancement'],
    links: ['entites/opco', 'livrables/abc123'],
    body: '**Résumé.** Test.',
    frontmatter: {},
    source_ref: 'A.1',
    source_hash: 'h1',
  };
  it('sérialise frontmatter + wikilinks + corps', () => {
    const md = buildMarkdown(note);
    expect(md).toContain('type: fiche');
    expect(md).toContain('"Cadrage (M0–M1)"');
    expect(md).toContain('[[entites/opco]]');
    expect(md.trimEnd().endsWith('**Résumé.** Test.')).toBe(true);
  });
  it('round-trip du frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter(buildMarkdown(note));
    expect(frontmatter.type).toBe('fiche');
    expect(frontmatter.title).toBe('Cadrage (M0–M1)');
    expect(body).toBe('**Résumé.** Test.');
  });
});

describe('ficheToBrainNote', () => {
  const fiche: FinalizedFiche = {
    fiche_id: 'uuid-1',
    mission_code: 'A',
    mission_nom: 'Lancement',
    fiche_code: 'A.1',
    titre: 'Cadrage',
    priorite: null,
    contenu: '...',
    content_hash: 'h1',
    detail: {
      mission: { code: 'A', nom: 'Lancement' },
      fiche: {
        code: 'A.1',
        titre: 'Cadrage',
        description: null,
        priorite: null,
        statut: null,
      },
      taches: [
        {
          titre: 'T1',
          description: null,
          type: null,
          echeance: null,
          realise: false,
          valide_cdp: false,
          valide: false,
          responsable_nom: null,
          liens: [
            {
              libelle: 'Doc',
              url: 'https://drive.google.com/file/d/FILE42/view',
            },
          ],
        },
      ],
    },
    detail_hash: 'd1',
  };
  const analysis = {
    title: 'Cadrage de la création',
    summary: 'Résumé.',
    key_points: ['Point 1'],
    entities: ['OPCO'],
    aliases: ['M0-M1'],
    tags: ['lancement'],
  };
  it('construit une note fiche avec path stable (mission+code), source_ref=fiche_id, liens livrables', () => {
    const note = ficheToBrainNote(fiche, analysis);
    expect(note.path).toBe('fiches/lancement-a-1.md');
    expect(note.type).toBe('fiche');
    expect(note.source_ref).toBe('uuid-1');
    expect(note.source_hash).toBe('h1');
    expect(note.links).toContain('entites/opco');
    expect(note.links).toContain('livrables/FILE42');
    expect(note.body).toContain('Résumé.');
    expect(note.body).toContain('Point 1');
  });
});

describe('isNonAnswer', () => {
  it('détecte les non-réponses', () => {
    expect(
      isNonAnswer('Je ne trouve pas cette information dans les process.'),
    ).toBe(true);
    expect(isNonAnswer('Aucune information disponible.')).toBe(true);
    expect(isNonAnswer('trop court')).toBe(true);
  });
  it('accepte une vraie réponse', () => {
    expect(
      isNonAnswer(
        'Les 3 statuts sont Dispose, À construire et SOLUVIA s’en charge selon la fiche.',
      ),
    ).toBe(false);
  });
});

describe('conversationToBrainNote', () => {
  it('capitalise une Q/R validée (path=question, liens sources, frontmatter anti-obsolescence)', () => {
    const note = conversationToBrainNote(
      {
        id: 'fb1',
        question: 'Quels sont les 3 statuts ?',
        answer: 'Dispose, À construire, SOLUVIA s’en charge.',
      },
      ['livrables/FILE42.md', 'fiches/lancement-a-1'],
      'qahash',
      { 'livrables/FILE42': 'h42' },
    );
    expect(note.type).toBe('conversation');
    // Suffixe de hash : le path est injectif (cf. `conversationPath`), deux
    // questions au préfixe commun ne peuvent plus s'écraser l'une l'autre.
    expect(note.path).toMatch(
      /^conversations\/quels-sont-les-3-statuts-[0-9a-f]{8}\.md$/,
    );
    expect(note.title).toBe('Quels sont les 3 statuts ?');
    expect(note.source_ref).toBe('fb1');
    expect(note.source_hash).toBe('qahash');
    expect(note.links).toContain('livrables/FILE42');
    expect(note.links).toContain('fiches/lancement-a-1');
    expect(note.frontmatter.source_hashes).toEqual({
      'livrables/FILE42': 'h42',
    });
    expect(note.body).toContain('Dispose');
    expect(note.body).toContain('👍');
  });
});

describe('entityToBrainNote', () => {
  it('construit une note-carrefour avec définition + backlinks', () => {
    const note = entityToBrainNote(
      'opco',
      'OPCO',
      ['fiches/lancement-a-1', 'livrables/FILE42', 'fiches/lancement-a-1'],
      'Opérateur de compétences finançant la formation.',
      'ehash',
    );
    expect(note.type).toBe('entite');
    expect(note.path).toBe('entites/opco.md');
    expect(note.title).toBe('OPCO');
    expect(note.source_ref).toBe(entitySourceRef('opco'));
    expect(note.source_ref).toBe('entite:opco');
    // dédupliqué
    expect(note.links).toEqual(['fiches/lancement-a-1', 'livrables/FILE42']);
    expect(note.body).toContain('Opérateur de compétences');
    expect(note.body).toContain('[[fiches/lancement-a-1]]');
  });

  it('persiste la définition en frontmatter, qui survit à la réécriture', () => {
    const definition = 'Opérateur de compétences finançant la formation.';
    const note = entityToBrainNote(
      'opco',
      'OPCO',
      ['fiches/a'],
      definition,
      'h1',
    );
    expect(note.frontmatter).toEqual({ definition });

    // La note est réécrite quand les backlinks bougent : la définition relue
    // depuis le frontmatter doit traverser l'aller-retour intacte.
    const relue =
      (note.frontmatter as { definition?: string }).definition ?? '';
    const reecrite = entityToBrainNote(
      'opco',
      'OPCO',
      ['fiches/a', 'fiches/b'],
      relue,
      'h2',
    );
    expect(reecrite.frontmatter).toEqual({ definition });
    expect(reecrite.body).toContain(definition);
    expect(reecrite.links).toEqual(['fiches/a', 'fiches/b']);
  });

  it('sans définition, le frontmatter reste vide', () => {
    const note = entityToBrainNote('opco', 'OPCO', ['fiches/a'], '', 'h1');
    expect(note.frontmatter).toEqual({});
  });

  // `definitionDepuisCorps` est la réciproque du corps rendu ici. Règle unique
  // pour le script (qui relit une définition publiée) et pour `applyProposal`
  // (qui la re-dérive d'un corps édité) : si elle cessait d'être réciproque, la
  // copie en frontmatter divergerait du corps.
  it('definitionDepuisCorps relit la définition rendue dans le corps', () => {
    const definition = 'Opérateur de compétences finançant la formation.';
    const note = entityToBrainNote(
      'opco',
      'OPCO',
      ['fiches/a'],
      definition,
      'h1',
    );
    expect(definitionDepuisCorps(note.body)).toBe(definition);
  });

  it('definitionDepuisCorps rend vide quand le corps ne porte rien', () => {
    const note = entityToBrainNote('opco', 'OPCO', ['fiches/a'], '', 'h1');
    expect(definitionDepuisCorps(note.body)).toBe('');
    expect(definitionDepuisCorps('')).toBe('');
  });
});

describe('fichiersOrphelins', () => {
  const genere = (type: string, titre = 'T') =>
    `---\ntype: ${type}\ntitle: ${JSON.stringify(titre)}\naliases: []\ntags: []\nlinks: []\n---\n\n# ${titre}\n`;

  it('un fichier sans note correspondante est orphelin', () => {
    expect(
      fichiersOrphelins(
        [
          { path: 'fiches/vivante.md', content: genere('fiche') },
          { path: 'fiches/archivee.md', content: genere('fiche') },
          // Ancien chemin de conversation, avant le suffixe de hash.
          {
            path: 'conversations/comment-faire.md',
            content: genere('conversation'),
          },
        ],
        ['fiches/vivante.md', 'conversations/comment-faire-a1b2c3d4.md'],
      ),
    ).toEqual(['fiches/archivee.md', 'conversations/comment-faire.md']);
  });

  it('un fichier hors des dossiers de notes n’est jamais orphelin', () => {
    expect(
      fichiersOrphelins(
        [
          // Racine du coffre : écrite par brain-ingest, hors périmètre.
          { path: '_lacunes.md', content: genere('fiche') },
          { path: 'README.md', content: genere('fiche') },
          // Dossier créé par l'utilisateur, même avec un frontmatter copié.
          { path: 'perso/notes.md', content: genere('fiche') },
          { path: '.obsidian/plugins/x.md', content: genere('fiche') },
        ],
        ['fiches/vivante.md'],
      ),
    ).toEqual([]);
  });

  it('un fichier sans frontmatter `type` connu n’est jamais candidat', () => {
    expect(
      fichiersOrphelins(
        [
          {
            path: 'entites/a-la-main.md',
            content: '# Note perso\n\nÉcrite dans Obsidian.\n',
          },
          {
            path: 'entites/sans-type.md',
            content: '---\ntitle: "X"\n---\n\n# X\n',
          },
          { path: 'entites/type-inconnu.md', content: genere('memo') },
          { path: 'entites/orpheline.md', content: genere('entite') },
        ],
        ['entites/vivante.md'],
      ),
    ).toEqual(['entites/orpheline.md']);
  });

  // Le garde-fou : si la lecture de la base échoue ou rend zéro ligne, tout le
  // coffre passerait pour obsolète. Une liste de conservation vide ne doit
  // rendre aucun orphelin, sinon un --prune viderait le coffre sur une panne.
  it('une liste de notes vide ne rend aucun orphelin', () => {
    expect(
      fichiersOrphelins(
        [
          { path: 'fiches/a.md', content: genere('fiche') },
          { path: 'entites/opco.md', content: genere('entite') },
          { path: 'livrables/abc.md', content: genere('livrable') },
        ],
        [],
      ),
    ).toEqual([]);
  });
});
