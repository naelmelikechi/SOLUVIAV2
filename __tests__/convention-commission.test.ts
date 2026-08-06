import { describe, it, expect } from 'vitest';
import {
  COMMISSION_EST_TTC,
  commissionSoluviaHt,
  commissionSoluviaTtc,
} from '@/lib/utils/convention-commission';

/**
 * Audit #122, constat 4 / chantier A.
 *
 * La meme expression `NPEC x taux / 100` etait lue comme du HT par le chemin de
 * facturation et comme du TTC par le chemin production, RAF et KPI dashboard.
 * Le modele `echeancier` etant le defaut, l'ecart etait structurel sur tout le
 * portefeuille non-HEOL.
 *
 * Ces tests ne tranchent PAS la convention : ils verrouillent le comportement
 * ACTUEL pour qu'il ne derive pas tant que la decision n'est pas prise, et ils
 * chiffrent l'effet de la bascule pour qu'elle soit deliberee et visible.
 */
describe('convention HT/TTC de la commission SOLUVIA', () => {
  it('le comportement actuel est preserve a l identique', () => {
    // Le chemin production appliquait `ttcToHt` sans distinguer le modele.
    // 8 000 x 12 % = 960 lu comme TTC, donc 800 HT.
    expect(commissionSoluviaHt(8000, 12)).toBeCloseTo(800, 2);
    expect(commissionSoluviaHt(8000, 12, 'engagement')).toBeCloseTo(800, 2);
    expect(commissionSoluviaHt(8000, 12, 'echeancier')).toBeCloseTo(800, 2);
  });

  it('documente l ecart chiffre du rapport, sur le template reel', () => {
    // Les factures emises portent 960,02 HT (chemin facturation, lecture HT).
    // Le pilotage affiche 800,00 (chemin production, lecture TTC).
    // Ratio Production / Facture = 83,33 %, soit exactement 1 / 1,2.
    const productionAffichee = commissionSoluviaHt(8000, 12, 'echeancier');
    const factureHt = (8000 * 12) / 100; // lecture HT du chemin facturation
    expect(factureHt).toBeCloseTo(960, 2);
    expect(productionAffichee / factureHt).toBeCloseTo(1 / 1.2, 4);
    // Et c'est ce qui rend le RAF negatif : 800 - 960 = -160.
    expect(productionAffichee - factureHt).toBeCloseTo(-160, 2);
  });

  it('la bascule en HT (option 1) fait remonter la production de 20 %', () => {
    // Simulation de la decision, sans la prendre : si l'echeancier passait a
    // `false`, la production affichee vaudrait le montant brut, soit +20 %.
    const actuel = commissionSoluviaHt(8000, 12, 'echeancier');
    const siConventionHt = (8000 * 12) / 100;
    expect(siConventionHt / actuel).toBeCloseTo(1.2, 4);
    // Le RAF redeviendrait nul face a une facture de 960,02.
    expect(siConventionHt - 960).toBeCloseTo(0, 2);
  });

  it('HT et TTC restent coherents entre eux, quelle que soit la convention', () => {
    for (const modele of ['engagement', 'echeancier'] as const) {
      const ht = commissionSoluviaHt(8000, 12, modele);
      const ttc = commissionSoluviaTtc(8000, 12, modele);
      // Le TTC doit toujours valoir le HT majore de 20 %, sinon l'un des deux
      // ecrans mentirait.
      expect(ttc).toBeCloseTo(ht * 1.2, 2);
    }
  });

  it('la table de convention est la SEULE source, et son etat est explicite', () => {
    // Ce test echoue volontairement si quelqu'un modifie la convention sans
    // passer par une decision : le changement devient visible en revue.
    expect(COMMISSION_EST_TTC).toEqual({
      engagement: true, // documente HEOL
      echeancier: true, // NON TRANCHE, comportement actuel conserve
    });
  });

  it('un taux ou un NPEC a zero ne produit pas de NaN', () => {
    expect(commissionSoluviaHt(0, 12, 'echeancier')).toBe(0);
    expect(commissionSoluviaHt(8000, 0, 'echeancier')).toBe(0);
    expect(commissionSoluviaTtc(0, 0, 'echeancier')).toBe(0);
  });
});
