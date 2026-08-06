import { describe, it, expect } from 'vitest';
import {
  tvaLigne,
  ttcLigne,
  ventilerTvaParTaux,
} from '@/lib/utils/tva-ventilation';

/**
 * Regression (audit #122, constat 14) : le PDF facture appliquait le taux
 * d'EN-TETE a chaque ligne, alors que `factures.taux_tva` est un taux DERIVE
 * recalcule par le trigger DB en (tva / ht) * 100.
 *
 * Le chiffrage de reference est celui deja fige par
 * __tests__/facture-totaux-recompute.test.ts : 1 000 HT a 20 % plus 500 HT a
 * 0 % donnent un taux d'en-tete de 13,33 %.
 */
describe('ventilation TVA par taux', () => {
  const mixte = [
    { montant_ht: 1000, taux_tva_ligne: 20 },
    { montant_ht: 500, taux_tva_ligne: 0 },
  ];
  // Taux derive que le trigger DB stocke en en-tete pour cette facture.
  const TAUX_ENTETE_DERIVE = 13.33;

  it('le TTC de chaque ligne suit le taux de la LIGNE, pas le taux derive', () => {
    // Avant : 1 000 x 1,1333 = 1 133,30 et 500 x 1,1333 = 566,65, pour une
    // somme de lignes de 1 699,95 contre un total d'en-tete de 1 700,00.
    expect(ttcLigne(mixte[0]!, TAUX_ENTETE_DERIVE)).toBe(1200);
    expect(ttcLigne(mixte[1]!, TAUX_ENTETE_DERIVE)).toBe(500);
    // Et la somme des lignes retombe bien sur le total.
    const sommeTtc =
      ttcLigne(mixte[0]!, TAUX_ENTETE_DERIVE) +
      ttcLigne(mixte[1]!, TAUX_ENTETE_DERIVE);
    expect(sommeTtc).toBe(1700);
  });

  it('ventile en une ligne de total par taux, du plus eleve au plus bas', () => {
    expect(ventilerTvaParTaux(mixte, TAUX_ENTETE_DERIVE)).toEqual([
      { taux: 20, tva: 200 },
      { taux: 0, tva: 0 },
    ]);
  });

  it('un seul taux : une seule entree, pas de faux libelle', () => {
    const uniforme = [
      { montant_ht: 1000, taux_tva_ligne: null },
      { montant_ht: 250, taux_tva_ligne: null },
    ];
    expect(ventilerTvaParTaux(uniforme, 20)).toEqual([{ taux: 20, tva: 250 }]);
  });

  it('taux_tva_ligne absent : la ligne suit le taux d en-tete', () => {
    expect(tvaLigne({ montant_ht: 1000 }, 20)).toBe(200);
    expect(ttcLigne({ montant_ht: 1000 }, 20)).toBe(1200);
  });

  it('autoliquidation intracom (0 %) : aucune TVA, TTC = HT', () => {
    expect(ventilerTvaParTaux([{ montant_ht: 1000 }], 0)).toEqual([
      { taux: 0, tva: 0 },
    ]);
    expect(ttcLigne({ montant_ht: 1000 }, 0)).toBe(1000);
  });

  it('arrondit au centime, sans derive de cumul', () => {
    // 3 lignes a 33,33 HT a 20 % : 6,67 chacune (arrondi au centime), 20,01 au
    // total. C'est bien la somme des TVA de ligne, coherente avec le trigger DB
    // qui calcule aussi ligne par ligne.
    const lignes = [
      { montant_ht: 33.33, taux_tva_ligne: 20 },
      { montant_ht: 33.33, taux_tva_ligne: 20 },
      { montant_ht: 33.33, taux_tva_ligne: 20 },
    ];
    expect(ventilerTvaParTaux(lignes, 20)).toEqual([{ taux: 20, tva: 20.01 }]);
  });
});
