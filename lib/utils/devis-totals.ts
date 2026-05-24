export interface LigneInput {
  libelle: string;
  description?: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
}

export interface LigneTotaux {
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

// Round to 2 decimals (centimes entiers, cf project_legal_invoicing)
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLigneTotaux(input: LigneInput): LigneTotaux {
  const ht = round2(input.quantite * input.prix_unitaire_ht);
  const tva = round2((ht * input.taux_tva) / 100);
  const ttc = round2(ht + tva);
  return { total_ht: ht, total_tva: tva, total_ttc: ttc };
}
