export interface OpcoInfo {
  code: string;
  nom: string;
}

/** Libellé affiché quand aucun OPCO n'est résolu depuis l'IDCC. */
export const OPCO_NON_RESOLU = 'Non résolu';

/** IDCC (convention collective, 4 chiffres) -> OPCO. */
export type OpcoMapping = Map<string, OpcoInfo>;

const IDCC_REGEX = /^[0-9]{1,4}$/;

/**
 * Forme canonique d'un IDCC : 4 chiffres avec zéros de tête (ex "16" -> "0016").
 * Renvoie null si la valeur est absente ou n'est pas un code numérique 1-4
 * chiffres. Eduvia renvoie déjà des IDCC sur 4 chiffres, mais on normalise des
 * deux côtés (seed et lookup) pour tolérer une saisie sans padding.
 */
export function normalizeIdcc(idcc: string | null | undefined): string | null {
  if (!idcc) return null;
  const trimmed = idcc.trim();
  if (!IDCC_REGEX.test(trimmed)) return null;
  return trimmed.padStart(4, '0');
}

/**
 * Résout l'OPCO d'un employeur depuis son IDCC (convention collective), seul
 * déterminant légal et 1:1 de l'OPCO. Renvoie null si l'IDCC est absent/invalide
 * ou s'il n'est rattaché à aucun OPCO actif du référentiel.
 */
export function resolveOpcoFromIdcc(
  idcc: string | null | undefined,
  mapping: OpcoMapping,
): OpcoInfo | null {
  const normalized = normalizeIdcc(idcc);
  if (!normalized) return null;
  return mapping.get(normalized) ?? null;
}
