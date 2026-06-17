import { describe, it, expect } from 'vitest';
import {
  computeChargeScore,
  dispoScore,
  computeCdpScore,
  rankCdps,
  type CdpChargeMetrics,
} from '@/lib/utils/cdp-scoring';

// Seuils de saturation (cf. constants.ts) : 5 clients OU 300 alternants.
// Les bornes ci-dessous sont calées sur ces deux plafonds — si une constante
// change sans révision du barème, ces tests le signalent.

describe('computeChargeScore — capacité restante 0-100', () => {
  it('renvoie 100 (vide) pour une charge nulle', () => {
    const r = computeChargeScore(0, 0);
    expect(r.score).toBe(100);
    expect(r.ratio).toBe(0);
    expect(r.sature).toBe(false);
  });

  it('tombe à 0 et sature au seuil clients (5 clients)', () => {
    const r = computeChargeScore(5, 0);
    expect(r.score).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.sature).toBe(true);
  });

  it('tombe à 0 et sature au seuil alternants (300 alternants)', () => {
    const r = computeChargeScore(0, 300);
    expect(r.score).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.sature).toBe(true);
  });

  it('reste à 0 (score plancher) au-delà des seuils', () => {
    expect(computeChargeScore(10, 0).score).toBe(0);
    expect(computeChargeScore(0, 600).score).toBe(0);
    // Le ratio, lui, continue de croître au-delà de 1.
    expect(computeChargeScore(10, 0).ratio).toBe(2);
    expect(computeChargeScore(0, 600).ratio).toBe(2);
  });

  it('décroît linéairement par paliers de clients', () => {
    expect(computeChargeScore(1, 0).score).toBe(80);
    expect(computeChargeScore(2, 0).score).toBe(60);
    expect(computeChargeScore(3, 0).score).toBe(40);
    expect(computeChargeScore(4, 0).score).toBe(20);
  });

  it('décroît linéairement par paliers d’alternants', () => {
    expect(computeChargeScore(0, 75).score).toBe(75);
    expect(computeChargeScore(0, 150).score).toBe(50);
  });

  it('prend le ratio LE PLUS contraignant des deux axes', () => {
    // Axe clients dominant : 4/5 = 0.8 > 30/300 = 0.1 → ratio 0.8, score 20.
    const clientsLimite = computeChargeScore(4, 30);
    expect(clientsLimite.ratio).toBe(0.8);
    expect(clientsLimite.score).toBe(20);
    // Axe alternants dominant : 150/300 = 0.5 > 1/5 = 0.2 → ratio 0.5, score 50.
    const alternantsLimite = computeChargeScore(1, 150);
    expect(alternantsLimite.ratio).toBe(0.5);
    expect(alternantsLimite.score).toBe(50);
  });
});

describe('dispoScore — disponibilité déclarée → 0-100', () => {
  it('mappe chaque palier de disponibilité', () => {
    expect(dispoScore('disponible')).toBe(100);
    expect(dispoScore('tendu')).toBe(50);
    expect(dispoScore('sature')).toBe(0);
  });

  it('retombe sur la valeur neutre 60 quand la dispo est inconnue', () => {
    expect(dispoScore(null)).toBe(60);
    expect(dispoScore(undefined)).toBe(60);
  });
});

describe('computeCdpScore — score d’affectation (charge 40 / dispo 30, renormalisé /0.7)', () => {
  it('atteint 100 pour un CDP vide ET disponible', () => {
    const s = computeCdpScore({
      cdpId: 'a',
      nbClients: 0,
      nbAlternants: 0,
      disponibilite: 'disponible',
    });
    expect(s.score).toBe(100);
    expect(s.charge).toBe(100);
    expect(s.sature).toBe(false);
  });

  it('reste bas pour un CDP saturé même s’il se déclare disponible', () => {
    const s = computeCdpScore({
      cdpId: 'b',
      nbClients: 5,
      nbAlternants: 0,
      disponibilite: 'disponible',
    });
    // (0.4*0 + 0.3*100) / 0.7 = 42.857 → 43, bien en dessous de 100.
    expect(s.score).toBe(43);
    expect(s.charge).toBe(0);
    expect(s.sature).toBe(true);
  });

  it('tombe à 0 pour un CDP saturé ET indisponible', () => {
    const s = computeCdpScore({
      cdpId: 'c',
      nbClients: 5,
      nbAlternants: 0,
      disponibilite: 'sature',
    });
    expect(s.score).toBe(0);
  });

  it('applique la renormalisation /0.7 sur la dispo intermédiaire', () => {
    // CDP vide + tendu : (0.4*100 + 0.3*50) / 0.7 = 78.57 → 79.
    expect(
      computeCdpScore({
        cdpId: 'd',
        nbClients: 0,
        nbAlternants: 0,
        disponibilite: 'tendu',
      }).score,
    ).toBe(79);
    // Charge partielle (2 clients → 60) + tendu : (0.4*60 + 0.3*50)/0.7 = 55.7 → 56.
    expect(
      computeCdpScore({
        cdpId: 'e',
        nbClients: 2,
        nbAlternants: 0,
        disponibilite: 'tendu',
      }).score,
    ).toBe(56);
  });
});

describe('rankCdps — meilleur candidat en tête', () => {
  it('trie par score décroissant puis ratio croissant à score égal', () => {
    const metrics: CdpChargeMetrics[] = [
      // Saturé à 2x le seuil (ratio 2) — score 0.
      {
        cdpId: 'lourd',
        nbClients: 10,
        nbAlternants: 0,
        disponibilite: 'sature',
      },
      // Vide et disponible — meilleur candidat (score 100).
      {
        cdpId: 'libre',
        nbClients: 0,
        nbAlternants: 0,
        disponibilite: 'disponible',
      },
      // Tout juste saturé (ratio 1) — score 0 aussi mais ratio plus bas.
      {
        cdpId: 'limite',
        nbClients: 5,
        nbAlternants: 0,
        disponibilite: 'sature',
      },
    ];

    const ranked = rankCdps(metrics);

    expect(ranked.map((c) => c.cdpId)).toEqual(['libre', 'limite', 'lourd']);

    const [libre, limite, lourd] = ranked;
    if (!libre || !limite || !lourd) throw new Error('rang incomplet');
    expect(libre.score).toBe(100);
    // Départage à score égal (0) : ratio 1 (limite) avant ratio 2 (lourd).
    expect(limite.score).toBe(0);
    expect(lourd.score).toBe(0);
    expect(limite.ratio).toBeLessThan(lourd.ratio);
  });
});
