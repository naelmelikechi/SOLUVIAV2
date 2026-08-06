/**
 * Calcule les totaux d'une facture en mode "TTC inclus" :
 * la commission est exprimee TTC, on derive HT/TVA a rebours.
 *
 * Convention HEOL : montant_commissionne est TTC.
 *
 * Garantie d'arrondi : SUM(lignesHt) == totalHt exactement. Indispensable pour
 * la coherence legale facture <-> lignes (Art. 242 nonies A CGI : "la base
 * d'imposition, pour chaque taux distinct" doit etre coherente avec la somme
 * des lignes).
 *
 * SECONDE GARANTIE, ajoutee apres l'audit #122 (constat 16) : le TTC obtenu
 * APRES passage du trigger DB ne s'ecarte JAMAIS de plus d'UN centime du TTC
 * cible. L'exactitude n'est pas toujours atteignable, et ce n'est pas ce qui
 * compte : l'ensemble des TTC representables par des HT en centimes entiers
 * saute des valeurs (a 20 %, une ligne de 2 485,57 donne 2 982,68 et 2 485,58
 * donne 2 982,70 : 2 982,69 n'a aucun antecedent). L'algorithme retombe donc sur
 * la valeur atteignable la plus proche.
 *
 * Un centime est exactement la tolerance du trigger de liberation ci-dessous :
 * le bug venait des derives a DEUX centimes et plus.
 *
 * Pourquoi ce n'etait pas le cas. Cette fonction repartissait le centime de
 * reliquat sur le HT de la derniere ligne, sans verifier ce que le trigger
 * `recompute_facture_totaux` en ferait. Or ce trigger recalcule la TVA LIGNE PAR
 * LIGNE puis ecrase l'en-tete :
 *
 *   montant_ht  = round2( SUM(montant_ht) )
 *   montant_tva = SUM( round2(montant_ht x taux / 100) )
 *   montant_ttc = montant_ht + montant_tva
 *
 * Le TTC final n'etait donc pas celui vise. Exemple a 20 % : deux lignes de
 * 850,00 TTC donnent des HT de 708,33 et 708,34, dont les TVA arrondies font
 * 141,67 chacune, soit un TTC de 1 700,01 au lieu de 1 700,00.
 *
 * Consequence concrete, et raison de ce correctif : le trigger
 * `factures_liberer_events_sur_avoir_total` teste
 * `ABS(avoir_ttc) + 0,01 < origine_ttc`. Des que la derive atteignait 2
 * centimes, un avoir TOTAL etait classe PARTIEL, `event_libere_le` restait NULL
 * et les events du contrat restaient verrouilles dans
 * `uq_facture_lignes_event_live`, sans aucune echappatoire par l'UI. La cause
 * racine n'est pas le trigger, qui est legalement correct, c'est ce calcul.
 */

/**
 * TVA d'une ligne en centimes, avec la MEME regle que le trigger DB :
 * `floor(montant_ht * taux + 0.5) / 100` en euros, soit un arrondi au centime
 * le plus proche (moitie vers le haut).
 */
function tvaCentsDeLigne(htCents: number, tauxTva: number): number {
  return Math.floor((htCents * tauxTva) / 100 + 0.5);
}

/** TTC en centimes tel que le trigger DB le recalculera depuis les lignes. */
function ttcPostTrigger(lignesHtCents: number[], tauxTva: number): number {
  let ht = 0;
  let tva = 0;
  for (const h of lignesHtCents) {
    ht += h;
    tva += tvaCentsDeLigne(h, tauxTva);
  }
  return ht + tva;
}

export function computeFactureTotauxTtcInclus(
  events: { montant_commissionne: number }[],
  tauxTva: number,
): {
  totalTtc: number;
  totalHt: number;
  montantTva: number;
  lignesHt: number[];
} {
  const div = 1 + tauxTva / 100;
  // Travail en centimes entiers pour eviter la derive flottante.
  const lignesTtcCents = events.map((e) =>
    Math.round(e.montant_commissionne * 100),
  );
  const cibleTtcCents = lignesTtcCents.reduce((s, c) => s + c, 0);

  if (lignesTtcCents.length === 0) {
    return { totalTtc: 0, totalHt: 0, montantTva: 0, lignesHt: [] };
  }

  // Point de depart : chaque HT de ligne arrondi independamment.
  const htCents = lignesTtcCents.map((ttc) => Math.round(ttc / div));

  // Puis on ajuste les HT au centime pour que le TTC POST-TRIGGER retombe sur
  // la cible. Un ajustement de +1 centime sur un HT augmente le TTC de 1 ou 2
  // centimes selon que la TVA de la ligne franchit ou non un demi-centime : on
  // choisit donc a chaque pas l'ajustement qui rapproche le plus de la cible.
  // Borne d'iterations : une par centime d'ecart et par ligne, largement
  // suffisant (l'ecart initial ne depasse pas quelques centimes) et garantit
  // l'absence de boucle infinie.
  const maxIterations = 4 * htCents.length + 16;
  for (let iter = 0; iter < maxIterations; iter++) {
    const ecart = cibleTtcCents - ttcPostTrigger(htCents, tauxTva);
    if (ecart === 0) break;
    const sens = ecart > 0 ? 1 : -1;

    let meilleurIndex = -1;
    let meilleurEcartRestant = Math.abs(ecart);
    for (let i = htCents.length - 1; i >= 0; i--) {
      const avant = htCents[i]!;
      if (avant + sens < 0) continue; // un HT de ligne ne devient pas negatif
      const gain =
        sens +
        (tvaCentsDeLigne(avant + sens, tauxTva) -
          tvaCentsDeLigne(avant, tauxTva));
      const restant = Math.abs(ecart - gain);
      if (restant < meilleurEcartRestant) {
        meilleurEcartRestant = restant;
        meilleurIndex = i;
      }
    }
    // Aucun ajustement ne rapproche de la cible : on s'arrete sur le meilleur
    // etat atteint. Cas theorique (une seule ligne dont la cible n'est pas
    // atteignable) ; le test couvre l'exhaustivite sur des milliers de tirages.
    if (meilleurIndex === -1) break;
    htCents[meilleurIndex]! += sens;
  }

  // Les totaux renvoyes sont ceux que le trigger produira, et non des valeurs
  // qu'il ecraserait : c'est ce qui rend la facture coherente de bout en bout.
  const totalHtCents = htCents.reduce((s, c) => s + c, 0);
  const montantTvaCents = htCents.reduce(
    (s, h) => s + tvaCentsDeLigne(h, tauxTva),
    0,
  );

  return {
    totalTtc: (totalHtCents + montantTvaCents) / 100,
    totalHt: totalHtCents / 100,
    montantTva: montantTvaCents / 100,
    lignesHt: htCents.map((c) => c / 100),
  };
}
