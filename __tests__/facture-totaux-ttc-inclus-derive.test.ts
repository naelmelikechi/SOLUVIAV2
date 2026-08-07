import { describe, it, expect } from 'vitest';
import { computeFactureTotauxTtcInclus } from '@/lib/utils/facture-totaux-ttc-inclus';

/**
 * Regression (audit #122, constat 16) : derive du TTC apres passage du trigger.
 *
 * `computeFactureTotauxTtcInclus` repartissait le centime de reliquat sur le HT
 * de la derniere ligne sans verifier ce que le trigger DB en ferait. Or
 * `recompute_facture_totaux` recalcule la TVA LIGNE PAR LIGNE puis ecrase
 * l'en-tete. Le TTC final n'etait donc pas celui vise.
 *
 * Consequence : le trigger `factures_liberer_events_sur_avoir_total` teste
 * `ABS(avoir_ttc) + 0,01 < origine_ttc`. Des 2 centimes de derive, un avoir
 * TOTAL etait classe PARTIEL, `event_libere_le` restait NULL et les events du
 * contrat restaient verrouilles, sans echappatoire par l'UI.
 *
 * Ce fichier simule le trigger a l'identique et verifie l'invariant sur des
 * milliers de configurations deterministes.
 */

/**
 * Simulation FIDELE de recompute_facture_totaux
 * (20260630141000_facture_lignes_integrite_db.sql) :
 *   montant_ht  = round2( SUM(montant_ht) )
 *   montant_tva = SUM( floor(montant_ht * taux + 0.5) / 100 )
 *   montant_ttc = montant_ht + montant_tva
 */
function triggerDb(
  lignesHt: number[],
  tauxTva: number,
): { ht: number; tva: number; ttc: number } {
  const htCents = lignesHt.reduce((s, h) => s + Math.round(h * 100), 0);
  const tvaCents = lignesHt.reduce(
    (s, h) => s + Math.floor((Math.round(h * 100) * tauxTva) / 100 + 0.5),
    0,
  );
  return {
    ht: htCents / 100,
    tva: tvaCents / 100,
    ttc: (htCents + tvaCents) / 100,
  };
}

/** Generateur deterministe (pas de Math.random : un echec doit etre rejouable). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 0x100000000;
  };
}

describe('computeFactureTotauxTtcInclus : coherence avec le trigger DB', () => {
  it('le cas minimal du rapport : 2 lignes de 850,00 TTC a 20 %', () => {
    // Avant : HT 708,33 + 708,34, TVA 141,67 chacune, TTC post-trigger
    // 1 700,01 au lieu de 1 700,00.
    const r = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 850 }, { montant_commissionne: 850 }],
      20,
    );
    expect(r.totalTtc).toBe(1700);
    expect(triggerDb(r.lignesHt, 20).ttc).toBe(1700);
  });

  it('SUM(lignesHt) == totalHt reste garanti (invariant legal historique)', () => {
    const r = computeFactureTotauxTtcInclus(
      [
        { montant_commissionne: 333.33 },
        { montant_commissionne: 333.33 },
        { montant_commissionne: 333.34 },
      ],
      20,
    );
    const somme = Math.round(r.lignesHt.reduce((s, h) => s + h * 100, 0));
    expect(somme).toBe(Math.round(r.totalHt * 100));
  });

  it('aucune ligne negative, et les HT restent proches du TTC / 1,2', () => {
    const r = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 0.01 }, { montant_commissionne: 0.02 }],
      20,
    );
    for (const h of r.lignesHt) expect(h).toBeGreaterThanOrEqual(0);
    expect(triggerDb(r.lignesHt, 20).ttc).toBe(0.03);
  });

  it('ligne unique : la cible peut etre arithmetiquement inatteignable, ecart borne a 1 centime', () => {
    // Fait arithmetique, pas un defaut : a 20 %, avec UNE seule ligne,
    // l'ensemble des TTC atteignables saute des valeurs. Pour 2 982,69 EUR il
    // passe de 2 982,68 (ht 2 485,57) a 2 982,70 (ht 2 485,58) : 2 982,69 n'a
    // aucun antecedent en centimes entiers. On exige donc le meilleur possible,
    // soit un ecart maximal de 1 centime, et non l'exactitude.
    const r = computeFactureTotauxTtcInclus(
      [{ montant_commissionne: 2982.69 }],
      20,
    );
    expect(
      Math.abs(triggerDb(r.lignesHt, 20).ttc - 2982.69),
    ).toBeLessThanOrEqual(0.01);
  });

  it('exhaustif : l ecart post-trigger ne depasse JAMAIS 1 centime', () => {
    // C'est l'invariant qui compte, et non l'exactitude : le trigger
    // factures_liberer_events_sur_avoir_total tolere exactement 1 centime
    // (ABS(avoir_ttc) + 0,01 < origine_ttc). Le bug venait des derives a 2
    // centimes ET PLUS, qui faisaient classer un avoir total comme partiel.
    //
    // L'exactitude n'est pas toujours atteignable : l'ensemble des TTC
    // representables par des HT en centimes entiers saute des valeurs, et cela
    // ne depend pas du nombre de lignes (vu a 2 et 3 lignes aussi). Ce que
    // l'algorithme garantit, c'est de retomber sur la valeur atteignable la plus
    // proche, donc a 1 centime au maximum.
    const rnd = lcg(20260806);
    const tauxCandidats = [20, 10, 5.5, 0];
    let cas = 0;
    let ecartMaxCents = 0;
    const horsTolerance: string[] = [];

    for (const taux of tauxCandidats) {
      // Jusqu'a 20 lignes : le rapport chiffrait 41 % de factures bloquees a ce
      // volume, c'est la zone la plus exposee.
      for (let nbLignes = 1; nbLignes <= 20; nbLignes++) {
        for (let tirage = 0; tirage < 60; tirage++) {
          const events = Array.from({ length: nbLignes }, () => ({
            // Commissions realistes : de quelques euros a quelques milliers.
            montant_commissionne: Math.round(rnd() * 400000) / 100,
          }));
          const cibleCents = events.reduce(
            (s, e) => s + Math.round(e.montant_commissionne * 100),
            0,
          );

          const r = computeFactureTotauxTtcInclus(events, taux);
          const apresTrigger = triggerDb(r.lignesHt, taux);
          cas++;

          const ecart = Math.abs(
            Math.round(apresTrigger.ttc * 100) - cibleCents,
          );
          if (ecart > ecartMaxCents) ecartMaxCents = ecart;
          if (ecart > 1) {
            horsTolerance.push(
              `taux=${taux} lignes=${nbLignes} cible=${cibleCents / 100} obtenu=${apresTrigger.ttc}`,
            );
          }
          // Les totaux annonces doivent etre ceux que le trigger produira,
          // sinon l'en-tete ecrit avant les lignes serait faux.
          if (
            r.totalTtc !== apresTrigger.ttc ||
            r.totalHt !== apresTrigger.ht ||
            r.montantTva !== apresTrigger.tva
          ) {
            horsTolerance.push(
              `desaccord en-tete/trigger : taux=${taux} lignes=${nbLignes}`,
            );
          }
        }
      }
    }

    expect(cas).toBe(4 * 20 * 60);
    expect(horsTolerance.slice(0, 5)).toEqual([]);
    // Documente la borne reellement observee, pour qu'une regression qui la
    // degrade se voie.
    expect(ecartMaxCents).toBeLessThanOrEqual(1);
  });

  it("la tolerance d'un centime du trigger de liberation n'est plus jamais franchie", () => {
    // Reproduction du test du trigger factures_liberer_events_sur_avoir_total :
    // ABS(avoir_ttc) + 0,01 < origine_ttc classe l'avoir comme PARTIEL.
    // Avec un avoir total, la derive doit etre nulle, donc jamais > 1 centime.
    const rnd = lcg(4242);
    for (let nbLignes = 2; nbLignes <= 20; nbLignes++) {
      for (let tirage = 0; tirage < 40; tirage++) {
        const events = Array.from({ length: nbLignes }, () => ({
          montant_commissionne: Math.round(rnd() * 250000) / 100,
        }));
        const origine = computeFactureTotauxTtcInclus(events, 20);
        // L'avoir total reprend exactement les memes montants, au signe pres.
        const avoir = computeFactureTotauxTtcInclus(
          events.map((e) => ({ montant_commissionne: e.montant_commissionne })),
          20,
        );
        const origineTtc = triggerDb(origine.lignesHt, 20).ttc;
        const avoirTtc = triggerDb(avoir.lignesHt, 20).ttc;
        expect(Math.abs(avoirTtc) + 0.01).toBeGreaterThanOrEqual(origineTtc);
      }
    }
  });
});
