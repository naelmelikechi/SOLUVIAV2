/**
 * Garde-fou taux dérogatoire (specs commerciales validées, Direction 2026-06-09,
 * Feature 2 §9 / Feature 4 §8) : tout taux NPEC négocié sous 35 % doit remonter
 * immédiatement à la Direction.
 *
 * Logique pure (testée) : on alerte au FRANCHISSEMENT du seuil uniquement, pas
 * à chaque sauvegarde d'une opportunité déjà sous le seuil (anti-spam).
 */

export const SEUIL_TAUX_DEROGATOIRE = 35;

/**
 * Faut-il alerter la Direction pour ce changement de taux ?
 * - `next` < 35 requis (null/absent = pas de taux saisi = pas d'alerte) ;
 * - `previous` null ou >= 35 requis (déjà < 35 = déjà alerté, on ne re-notifie pas).
 */
export function doitAlerterTaux(
  previous: number | null | undefined,
  next: number | null | undefined,
): boolean {
  if (next == null || next >= SEUIL_TAUX_DEROGATOIRE) return false;
  return previous == null || previous >= SEUIL_TAUX_DEROGATOIRE;
}
