export type Etape = {
  id: string;
  libelle: string;
  couleur: string;
  type: string;
  ordre: number;
};
export type OppAdresseLite = {
  departement: string | null;
  region: string | null;
};
export type OppCard = {
  id: string;
  intitule: string;
  probabilite: number | null;
  etape_id: string;
  statut: string;
  compte: { id: string; nom: string; adresses?: OppAdresseLite[] } | null;
  owner: { prenom: string | null; nom: string | null } | null;
};
