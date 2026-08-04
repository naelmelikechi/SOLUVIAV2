import { describe, it, expect } from 'vitest';
import { sumAvoirsEmis, soldeNetHt } from '@/lib/utils/avoir-netting';

describe('sumAvoirsEmis', () => {
  it('somme uniquement les avoirs emis (statut avoir)', () => {
    expect(
      sumAvoirsEmis([
        { montant_ht: -100, statut: 'avoir' },
        { montant_ht: -50, statut: 'a_emettre' }, // brouillon : ignore
      ]),
    ).toBe(-100);
  });

  it('retourne 0 sans avoirs', () => {
    expect(sumAvoirsEmis([])).toBe(0);
    expect(sumAvoirsEmis(null)).toBe(0);
    expect(sumAvoirsEmis(undefined)).toBe(0);
  });

  it('tolere montant_ht null', () => {
    expect(sumAvoirsEmis([{ montant_ht: null, statut: 'avoir' }])).toBe(0);
  });
});

describe('soldeNetHt', () => {
  it('facture sans avoir : solde = montant', () => {
    expect(soldeNetHt(1000, [])).toBe(1000);
  });

  it('avoir partiel : solde reduit', () => {
    expect(soldeNetHt(1000, [{ montant_ht: -400, statut: 'avoir' }])).toBe(600);
  });

  it('avoir total (cas AVR-SOL-0001..0004) : solde = 0', () => {
    expect(soldeNetHt(4012.8, [{ montant_ht: -4012.8, statut: 'avoir' }])).toBe(
      0,
    );
  });

  it('clampe a 0 si avoir superieur au montant', () => {
    expect(soldeNetHt(100, [{ montant_ht: -150, statut: 'avoir' }])).toBe(0);
  });

  it('brouillon d avoir ne reduit pas le solde', () => {
    expect(soldeNetHt(1000, [{ montant_ht: -1000, statut: 'a_emettre' }])).toBe(
      1000,
    );
  });

  it('accepte la forme objet simple de l embed PostgREST (types self-ref)', () => {
    expect(soldeNetHt(1000, { montant_ht: -400, statut: 'avoir' })).toBe(600);
    expect(soldeNetHt(1000, { montant_ht: -400, statut: 'a_emettre' })).toBe(
      1000,
    );
  });

  it('plusieurs avoirs cumules', () => {
    expect(
      soldeNetHt(1000, [
        { montant_ht: -300, statut: 'avoir' },
        { montant_ht: -200, statut: 'avoir' },
      ]),
    ).toBe(500);
  });
});
