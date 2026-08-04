import { describe, it, expect } from 'vitest';
import {
  slugify,
  notePath,
  wikilink,
  linkTarget,
  buildMarkdown,
  parseFrontmatter,
  ficheToBrainNote,
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
