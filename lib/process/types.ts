export interface FinalizedFiche {
  fiche_id: string;
  mission_code: string;
  mission_nom: string;
  fiche_code: string;
  titre: string;
  priorite: string | null;
  contenu: string;
  content_hash: string;
}

export interface ProcessSearchResult {
  source_fiche_id: string;
  titre: string;
  mission: string;
  url: string;
  snippet: string;
  score: number;
}
