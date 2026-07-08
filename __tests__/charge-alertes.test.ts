import { describe, expect, it } from 'vitest';
import {
  computeChargeAlertes,
  type CdpChargeEtat,
} from '@/lib/passation/charge-alertes';
import { estRouge, seuilCharge } from '@/lib/utils/cdp-scoring';

function etat(
  partial: Partial<CdpChargeEtat> & { cdpId: string },
): CdpChargeEtat {
  return { ratio: 0, disponibilite: null, seuilNotifie: 0, ...partial };
}

describe('seuilCharge', () => {
  it('0 sous 80 %', () => {
    expect(seuilCharge(0, null)).toBe(0);
    expect(seuilCharge(0.79, 'disponible')).toBe(0);
  });

  it('80 entre 80 et 95 %', () => {
    expect(seuilCharge(0.8, null)).toBe(80);
    expect(seuilCharge(0.94, 'tendu')).toBe(80);
  });

  it('95 au-dela de 95 %', () => {
    expect(seuilCharge(0.95, null)).toBe(95);
    expect(seuilCharge(1.4, null)).toBe(95);
  });

  it('95 si saturation declaree, meme a faible charge', () => {
    expect(seuilCharge(0.1, 'sature')).toBe(95);
    expect(estRouge(0.1, 'sature')).toBe(true);
    expect(estRouge(0.94, 'tendu')).toBe(false);
  });
});

describe('computeChargeAlertes', () => {
  it('aucune alerte quand rien ne change', () => {
    const r = computeChargeAlertes([
      etat({ cdpId: 'a', ratio: 0.5 }),
      etat({ cdpId: 'b', ratio: 0.85, seuilNotifie: 80 }),
    ]);
    expect(r.montees80).toEqual([]);
    expect(r.montees95).toEqual([]);
    expect(r.aPersister).toEqual([]);
    expect(r.escaladeTousRouges).toBe(false);
  });

  it('franchissement 80 : notifie et persiste', () => {
    const r = computeChargeAlertes([etat({ cdpId: 'a', ratio: 0.82 })]);
    expect(r.montees80).toEqual([{ cdpId: 'a', seuil: 80 }]);
    expect(r.montees95).toEqual([]);
    expect(r.aPersister).toEqual([{ cdpId: 'a', seuil: 80 }]);
  });

  it('franchissement direct 0 -> 95 : mail Direction, pas de doublon 80', () => {
    const r = computeChargeAlertes([etat({ cdpId: 'a', ratio: 1.1 })]);
    expect(r.montees80).toEqual([]);
    expect(r.montees95).toEqual([{ cdpId: 'a', seuil: 95 }]);
  });

  it('80 -> 95 : seule la montee 95 part', () => {
    const r = computeChargeAlertes([
      etat({ cdpId: 'a', ratio: 0.96, seuilNotifie: 80 }),
    ]);
    expect(r.montees80).toEqual([]);
    expect(r.montees95).toEqual([{ cdpId: 'a', seuil: 95 }]);
  });

  it('redescente : pas de notification mais re-armement persiste', () => {
    const r = computeChargeAlertes([
      etat({ cdpId: 'a', ratio: 0.5, seuilNotifie: 95 }),
    ]);
    expect(r.montees80).toEqual([]);
    expect(r.montees95).toEqual([]);
    expect(r.aPersister).toEqual([{ cdpId: 'a', seuil: 0 }]);
  });

  it('deja notifie 95 : pas de re-notification', () => {
    const r = computeChargeAlertes([
      etat({ cdpId: 'a', ratio: 1.2, seuilNotifie: 95 }),
    ]);
    expect(r.montees95).toEqual([]);
    expect(r.aPersister).toEqual([]);
  });

  it('escalade uniquement quand TOUS rouges et au moins une transition', () => {
    // Un CDP encore orange : pas d'escalade.
    expect(
      computeChargeAlertes([
        etat({ cdpId: 'a', ratio: 1.0 }),
        etat({ cdpId: 'b', ratio: 0.85 }),
      ]).escaladeTousRouges,
    ).toBe(false);

    // Tous rouges dont une transition fraiche : escalade.
    expect(
      computeChargeAlertes([
        etat({ cdpId: 'a', ratio: 1.0 }),
        etat({ cdpId: 'b', ratio: 0.98, seuilNotifie: 95 }),
      ]).escaladeTousRouges,
    ).toBe(true);

    // Tous rouges mais tous deja notifies : pas de re-escalade.
    expect(
      computeChargeAlertes([
        etat({ cdpId: 'a', ratio: 1.0, seuilNotifie: 95 }),
        etat({ cdpId: 'b', ratio: 0.98, seuilNotifie: 95 }),
      ]).escaladeTousRouges,
    ).toBe(false);
  });

  it('liste vide : jamais d escalade', () => {
    expect(computeChargeAlertes([]).escaladeTousRouges).toBe(false);
  });
});
