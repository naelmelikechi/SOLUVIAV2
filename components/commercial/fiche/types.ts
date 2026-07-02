// Types partages entre les composants de la fiche prospect.
// Module feuille (aucun import) pour eviter les cycles d'imports
// fiche-tabs <-> fiche-rdv-tab / rdv-form-dialog.

export interface FicheCommercial {
  id: string;
  nom: string;
  prenom: string;
  role: string;
}
