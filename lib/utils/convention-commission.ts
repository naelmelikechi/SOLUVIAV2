import { ttcToHt, TVA_RATE } from '@/lib/utils/montant-ht';

/**
 * CONVENTION HT / TTC DE LA COMMISSION SOLUVIA : source unique de verite.
 *
 * ===========================================================================
 * DECISION EN ATTENTE (audit #122, constat 4 / chantier A)
 * ===========================================================================
 *
 * La meme expression `NPEC x taux / 100` etait interpretee de DEUX facons
 * opposees selon le chemin de code :
 *
 *   Chemin FACTURATION  lib/echeancier/calc.ts produit `baseTotal` et le
 *                       retourne dans un champ nomme `montant_ht`, puis
 *                       lib/actions/factures/brouillons-shared.ts ajoute 20 %
 *                       de TVA PAR-DESSUS. La commission est donc lue HT.
 *                       Le test __tests__/echeancier-calc.test.ts verrouille
 *                       explicitement cette convention.
 *
 *   Chemin PRODUCTION   lib/queries/production.ts calculait `totalSoluviaTtc`
 *   RAF, KPI dashboard  puis appliquait `ttcToHt`, soit une DIVISION par 1,2 de
 *                       la meme expression. La commission est donc lue TTC.
 *
 * Chiffrage sur NPEC 8 000, taux 12 %, duree 12 mois, entierement facture
 * (template reel « Standard 3/12 + 1/12 ») :
 *
 *   factures.montant_ht      960,02
 *   factures.montant_ttc   1 152,02
 *   production_soluvia HT    800,00
 *   raf_soluvia affiche     -160,02      <- RAF negatif, non clampe
 *   ratio Production/Facture  83,33 %
 *
 * Le modele `echeancier` etant le DEFAUT (seul le client HEO est en
 * `engagement`), l'ecart est structurel sur tout le portefeuille non-HEOL.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL NE DECIDE PAS
 * ---------------------------------------------------------------------------
 *
 * Ce qui tranche n'est pas dans le repo : c'est le libelle des contrats de
 * partenariat NON-HEOL. La seule convention TTC explicitement documentee du
 * depot est estampillee HEOL (brouillon-from-events.ts : « Convention metier
 * (HEOL) : la commission Soluvia est exprimee TTC »), et HEOL est precisement
 * le seul client en `engagement`. Le module production avait generalise cette
 * convention HEOL a tous les contrats, sans filtre de modele.
 *
 * Ce fichier ne tranche donc rien. Il fait trois choses :
 *
 *  1. Il rend la convention EXPLICITE et par modele, au lieu d'etre implicite
 *     dans un `ttcToHt` perdu au milieu d'un calcul.
 *  2. Il devient le SEUL endroit a modifier. Aujourd'hui la divergence exige de
 *     retrouver deux chemins de code ; demain c'est une ligne dans la table
 *     ci-dessous.
 *  3. Il conserve EXACTEMENT le comportement actuel, pour qu'aucun chiffre ne
 *     bouge tant que la decision n'est pas prise.
 *
 * `npx tsx scripts/verifier-convention-commission.ts` produit, sur un projet
 * echeancier reel, ce qui a ete facture et ce que chaque convention donnerait :
 * de quoi comparer au contrat et trancher.
 *
 * ---------------------------------------------------------------------------
 * COMMENT TRANCHER, une fois le contrat lu
 * ---------------------------------------------------------------------------
 *
 * Commission stipulee HT dans les contrats non-HEOL (option 1, recommandee par
 * le rapport) : passer `echeancier` a `false` ci-dessous. Les factures emises
 * sont alors correctes, c'est le pilotage qui mentait. La Production SOLUVIA
 * affichee augmente de 20 % sur ces projets et le RAF redevient positif.
 * AUCUNE facture a rectifier.
 *
 * Commission stipulee TTC (option 2) : laisser `true`, et c'est le chemin de
 * FACTURATION qu'il faut corriger, car il surfacture alors 20 % a chaque client
 * echeancier depuis la mise en service. Des avoirs sont a emettre sur
 * l'historique. Ce cas est critique et ne se limite pas a ce fichier.
 */

export type ModeleFacturation = 'engagement' | 'echeancier';

/**
 * `true` = l'expression `NPEC x taux / 100` est un montant TTC, dont il faut
 * deduire le HT. `false` = c'est deja un montant HT.
 *
 * ATTENTION : `echeancier` est a `true` uniquement parce que c'est le
 * comportement actuel du chemin production, PAS parce que la question est
 * tranchee. Voir l'en-tete de ce fichier.
 */
export const COMMISSION_EST_TTC: Record<ModeleFacturation, boolean> = {
  // Documente explicitement : « Convention metier (HEOL) : la commission
  // Soluvia est exprimee TTC ». HEOL est le seul client en `engagement`.
  engagement: true,
  // NON TRANCHE. Conserve le comportement actuel du chemin production.
  echeancier: true,
};

/**
 * Commission SOLUVIA en HT, selon la convention du modele de facturation.
 *
 * @param npec NPEC du contrat
 * @param tauxCommissionPct taux de commission en pourcentage (ex. 12 pour 12 %)
 * @param modele modele de facturation du projet. Par defaut `engagement`, qui
 *   correspond au comportement historique du chemin production (il appliquait
 *   `ttcToHt` sans distinguer les modeles) : ainsi un appelant qui ne passe pas
 *   encore le modele ne voit aucun changement.
 */
export function commissionSoluviaHt(
  npec: number,
  tauxCommissionPct: number,
  modele: ModeleFacturation = 'engagement',
): number {
  const brut = (npec * tauxCommissionPct) / 100;
  return COMMISSION_EST_TTC[modele] ? ttcToHt(brut) : brut;
}

/** Pendant TTC, pour les ecrans qui affichent les deux. */
export function commissionSoluviaTtc(
  npec: number,
  tauxCommissionPct: number,
  modele: ModeleFacturation = 'engagement',
): number {
  const brut = (npec * tauxCommissionPct) / 100;
  return COMMISSION_EST_TTC[modele] ? brut : brut * (1 + TVA_RATE);
}
