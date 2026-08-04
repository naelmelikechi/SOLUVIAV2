export type BrainNoteType = 'fiche' | 'livrable' | 'conversation' | 'entite';

export interface BrainNote {
  path: string; // 'fiches/lancement-a-1.md' (avec .md)
  type: BrainNoteType;
  title: string;
  aliases: string[];
  tags: string[];
  links: string[]; // cibles SANS extension, ex. 'entites/opco'
  body: string; // markdown (sans frontmatter)
  frontmatter: Record<string, unknown>;
  source_ref: string | null;
  source_hash: string | null;
}

export interface NoteAnalysis {
  title: string;
  summary: string;
  key_points: string[];
  entities: string[];
  aliases: string[];
  tags: string[];
}
