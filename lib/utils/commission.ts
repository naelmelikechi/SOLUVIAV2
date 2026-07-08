/**
 * Taux de commission SOLUVIA : source unique.
 *
 * Le taux est porte par `projets.taux_commission` (NUMERIC NOT NULL DEFAULT 10).
 * Historiquement, un `?? 10` etait duplique dans ~10 fichiers : si un projet
 * etait cree sans taux explicite (ou lu via une requete ou la colonne remonte
 * null), il facturait a 10 % SANS le moindre signal. Pour un client dont le
 * vrai taux est 40 % (HEOL) ou 55 % (MONKY), c'est une perte silencieuse.
 *
 * On centralise ici pour : (1) une seule constante, (2) pouvoir detecter les
 * projets restes au taux par defaut (cf. audit nocturne `projets_taux_defaut`).
 */

/** Taux applique par defaut a la creation d'un projet, en pourcentage. */
export const TAUX_COMMISSION_DEFAUT = 10;

/**
 * Resout le taux de commission d'un projet en pourcentage.
 * Retombe sur TAUX_COMMISSION_DEFAUT UNIQUEMENT si la valeur est absente
 * (null/undefined) ou non numerique. Un taux explicite de 0 % est CONSERVE :
 * les projets libres/internes sont legitimement a 0 %, on ne doit pas les
 * facturer a 10 %. Comportement identique a l'ancien `?? 10`.
 */
export function resolveTauxCommission(
  raw: number | string | null | undefined,
): number {
  if (raw == null) return TAUX_COMMISSION_DEFAUT;
  const n = Number(raw);
  return Number.isFinite(n) ? n : TAUX_COMMISSION_DEFAUT;
}

/**
 * Vrai si le projet est reste au taux par defaut (valeur absente ou == defaut).
 * Sert a signaler une eventuelle mauvaise configuration : un projet facturant
 * reellement mais toujours a 10 % merite une verification humaine.
 */
export function isTauxCommissionDefaut(
  raw: number | string | null | undefined,
): boolean {
  if (raw == null) return true;
  const n = Number(raw);
  return !Number.isFinite(n) || n === TAUX_COMMISSION_DEFAUT;
}
