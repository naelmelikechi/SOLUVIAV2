export interface FicheDetailTache {
  titre: string;
  description: string | null;
  type: string | null;
  echeance: string | null;
  realise: boolean;
  valide_cdp: boolean;
  valide: boolean;
  responsable_nom: string | null;
  liens: Array<{ libelle: string; url: string }>;
}

export interface FicheDetail {
  mission: { code: string; nom: string };
  fiche: {
    code: string;
    titre: string;
    description: string | null;
    priorite: string | null;
    statut: string | null;
  };
  taches: FicheDetailTache[];
}

export interface FinalizedFiche {
  fiche_id: string;
  mission_code: string;
  mission_nom: string;
  fiche_code: string;
  titre: string;
  priorite: string | null;
  contenu: string;
  content_hash: string;
  detail: FicheDetail;
  detail_hash: string;
}

export interface ProcessSearchResult {
  source_fiche_id: string;
  titre: string;
  mission: string;
  url: string;
  snippet: string;
  score: number;
}
