export type StatutProgression = 'avance' | 'a_jour' | 'retard';

export interface ProgressionApprenantResult {
  /** Part du temps ecoulee entre debut et fin, en %, bornee [0, 100]. Null si
   * une des deux dates manque. */
  theorique: number | null;
  /** reelle - theorique, en points. Null si la reelle ou la theorique est
   * inconnue. */
  ecart: number | null;
  statut: StatutProgression;
}

/**
 * Tolerance de 5 points au-dela de laquelle un ecart devient significatif.
 *
 * Sans elle, la quasi-totalite des apprenants apparaitrait en retard en
 * permanence : la progression reelle avance par paliers (une sequence
 * terminee a la fois, synchronisee depuis Eduvia), la theorique en continu
 * (un pourcentage du temps ecoule, recalcule chaque jour). Un apprenant tout
 * a fait dans les clous a presque toujours un ecart de quelques points au
 * moment ou on regarde. Sans tolerance, l'indicateur ne signalerait plus
 * rien : tout le monde serait rouge, personne ne le regarderait plus.
 */
export const TOLERANCE_POINTS = 5;

/**
 * Calcule la progression theorique, l'ecart avec la progression reelle et le
 * statut d'un apprenant.
 *
 * Une donnee absente (dates manquantes, progression reelle inconnue)
 * n'accuse jamais l'apprenant : statut `a_jour`, ecart `null`. Un indicateur
 * qui affiche un retard a tort est pire qu'un indicateur absent, parce qu'on
 * arrete de le regarder.
 *
 * @param dateDebut date de debut de contrat, format ISO `YYYY-MM-DD` (ou
 *   timestamp ISO complet)
 * @param dateFin date de fin de contrat, meme format
 * @param progressionReelle `contrats_progressions.progression_percentage`,
 *   ou null si jamais synchronisee
 * @param aujourdHui date du jour, meme format (injectable pour les tests)
 */
export function progressionApprenant(
  dateDebut: string | null,
  dateFin: string | null,
  progressionReelle: number | null,
  aujourdHui: string,
): ProgressionApprenantResult {
  const theorique = progressionTheorique(dateDebut, dateFin, aujourdHui);

  if (theorique === null || progressionReelle === null) {
    return { theorique, ecart: null, statut: 'a_jour' };
  }

  const ecart = progressionReelle - theorique;
  const statut: StatutProgression =
    ecart > TOLERANCE_POINTS
      ? 'avance'
      : ecart < -TOLERANCE_POINTS
        ? 'retard'
        : 'a_jour';

  return { theorique, ecart, statut };
}

function progressionTheorique(
  dateDebut: string | null,
  dateFin: string | null,
  aujourdHui: string,
): number | null {
  if (!dateDebut || !dateFin) return null;

  const debut = Date.parse(dateDebut);
  const fin = Date.parse(dateFin);
  const now = Date.parse(aujourdHui);
  if (Number.isNaN(debut) || Number.isNaN(fin) || Number.isNaN(now)) {
    return null;
  }

  if (fin <= debut) {
    // Formation ponctuelle (debut == fin) ou dates incoherentes : pas de
    // division par zero, la theorique bascule tout ou rien au jour J.
    return now >= debut ? 100 : 0;
  }

  const ratio = (now - debut) / (fin - debut);
  return Math.min(100, Math.max(0, ratio * 100));
}
