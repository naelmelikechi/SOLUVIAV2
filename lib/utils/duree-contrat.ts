/**
 * Duree d'un contrat en mois, ARRONDIE au mois le plus proche.
 *
 * Pourquoi un arrondi et pas une troncature : `differenceInMonths` compte les
 * mois REVOLUS. Un contrat d'apprentissage de 12 mois court du jour J au jour
 * J-1 de l'anniversaire (ex 2026-05-26 -> 2027-05-25, date_fin incluse), donc
 * il lui manque un jour pour valoir 12 mois revolus et il tombait a 11.
 *
 * L'impact n'etait pas cosmetique : `computeJalonContribution` ecarte tout
 * jalon dont `mois_relatif > duree_mois`, donc le jalon M+12 du template
 * standard (quote-part 0.0836) n'etait JAMAIS facture. Sur un portefeuille de
 * contrats a 12 mois, 8,36 % de la commission disparaissait sans le moindre
 * signal (constate sur 0017-FOR-APP et 0018-MON-APP, cf. migration
 * 20260805160000_duree_mois_arrondi.sql).
 *
 * Regle : mois revolus + 1 si le reliquat de jours atteint la moitie d'un mois
 * (>= 15 jours). Un contrat reellement plus court n'est donc pas gonfle :
 * 2026-05-01 -> 2027-04-01 reste a 11.
 */

import { addMonths, differenceInDays, differenceInMonths } from 'date-fns';

/** Seuil de bascule au mois superieur, en jours. */
const JOURS_ARRONDI_SUP = 15;

/**
 * @param dateDebut ISO yyyy-mm-dd (ou tout format parsable par Date)
 * @param dateFin   ISO yyyy-mm-dd
 * @returns duree en mois arrondie, ou null si une date manque/est invalide
 */
export function computeDureeMois(
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined,
): number | null {
  if (!dateDebut || !dateFin) return null;

  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  // Dates Eduvia malformees -> Invalid Date -> NaN, qui ferait echouer
  // l'upsert du contrat. On retombe sur null.
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return null;

  const moisRevolus = differenceInMonths(fin, debut);
  if (!Number.isFinite(moisRevolus)) return null;

  // Reliquat entre le dernier anniversaire mensuel et la date de fin.
  const anniversaire = addMonths(debut, moisRevolus);
  const joursRestants = differenceInDays(fin, anniversaire);

  return joursRestants >= JOURS_ARRONDI_SUP ? moisRevolus + 1 : moisRevolus;
}
