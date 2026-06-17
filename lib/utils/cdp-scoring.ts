import {
  CDP_SATURATION_CLIENTS,
  CDP_SATURATION_ALTERNANTS,
  type DispoCdp,
} from '@/lib/utils/constants';

export interface CdpChargeMetrics {
  cdpId: string;
  nbClients: number;
  nbAlternants: number;
  disponibilite: DispoCdp | null;
}

export interface CdpChargeResult {
  /** Capacité restante 0-100 (100 = vide, 0 = saturé). */
  score: number;
  /** Ratio de charge vs saturation (≥ 1 = saturé). */
  ratio: number;
  sature: boolean;
}

export interface CdpScore {
  cdpId: string;
  /** Score d'affectation global 0-100 (plus haut = meilleur candidat). */
  score: number;
  charge: number;
  ratio: number;
  sature: boolean;
}

/**
 * Capacité restante d'un CDP d'après sa charge réelle, relative au seuil de
 * saturation (5 clients OU 300 alternants — le plus contraignant).
 */
export function computeChargeScore(
  nbClients: number,
  nbAlternants: number,
): CdpChargeResult {
  const ratio = Math.max(
    CDP_SATURATION_CLIENTS > 0 ? nbClients / CDP_SATURATION_CLIENTS : 0,
    CDP_SATURATION_ALTERNANTS > 0
      ? nbAlternants / CDP_SATURATION_ALTERNANTS
      : 0,
  );
  return {
    score: Math.round(100 * Math.max(0, 1 - Math.min(ratio, 1))),
    ratio,
    sature: ratio >= 1,
  };
}

/** Disponibilité déclarée → score 0-100 (null = inconnu, neutre). */
export function dispoScore(d: DispoCdp | null | undefined): number {
  switch (d) {
    case 'disponible':
      return 100;
    case 'tendu':
      return 50;
    case 'sature':
      return 0;
    default:
      return 60;
  }
}

/**
 * Score d'affectation d'un CDP pour l'arbitrage (Feature 7 §Sujet 2).
 *
 * Pondération validée : charge 40 % · disponibilité 30 % · adéquation secteur
 * 20 % · continuité 10 %. Les 2 derniers critères dépendent de données absentes
 * du schéma Soluvia V2 (secteurs maîtrisés, historique de mission) → exclus en
 * V1 et le score est renormalisé sur charge (40) + disponibilité (30).
 * Pur et déterministe.
 */
export function computeCdpScore(m: CdpChargeMetrics): CdpScore {
  const charge = computeChargeScore(m.nbClients, m.nbAlternants);
  const score = Math.round(
    (0.4 * charge.score + 0.3 * dispoScore(m.disponibilite)) / 0.7,
  );
  return {
    cdpId: m.cdpId,
    score,
    charge: charge.score,
    ratio: charge.ratio,
    sature: charge.sature,
  };
}

/** Classe les CDP du meilleur candidat au moins bon (score décroissant). */
export function rankCdps(metrics: CdpChargeMetrics[]): CdpScore[] {
  return metrics
    .map(computeCdpScore)
    .sort((a, b) => b.score - a.score || a.ratio - b.ratio);
}
