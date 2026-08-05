// `document` = les documents du Drive « SOLUVIA BRAIN », ingérés par
// `scripts/brain-drive.ts`. Le type existe en base depuis la migration
// 20260804140000 (186 notes aujourd'hui) mais n'avait jamais été répercuté ici :
// tout ce qui dérive de cette union — dont la table FOLDER et donc l'élagage du
// coffre — ignorait silencieusement le dossier `documents/`.
export type BrainNoteType =
  | 'fiche'
  | 'livrable'
  | 'conversation'
  | 'entite'
  | 'document';

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
