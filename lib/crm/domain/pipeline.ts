import type { OppStatut } from './enums';

export type OppLite = {
  statut: OppStatut;
  etape_id: string;
  probabilite?: number | null;
  nb_alternants?: number | null;
};
export type EtapeLite = {
  id: string;
  libelle: string;
  ordre: number;
  couleur?: string;
};

/** Total d'apprentis (alternants) à recruter sur les opportunités ouvertes. */
export function apprentisEnPipeline(opps: OppLite[]): number {
  return opps
    .filter((o) => o.statut === 'ouverte')
    .reduce((s, o) => s + (o.nb_alternants ?? 0), 0);
}

export function conversionRate(opps: OppLite[]): number {
  const gagnees = opps.filter((o) => o.statut === 'gagnee').length;
  const perdues = opps.filter((o) => o.statut === 'perdue').length;
  const clos = gagnees + perdues;
  return clos === 0 ? 0 : Math.round((gagnees / clos) * 100);
}

export function computeFunnel(opps: OppLite[], etapes: EtapeLite[]) {
  return [...etapes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((etape) => {
      const sub = opps.filter((o) => o.etape_id === etape.id);
      return { etape, count: sub.length };
    });
}
