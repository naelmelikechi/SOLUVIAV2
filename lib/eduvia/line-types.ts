/**
 * Classification des line_type Eduvia pour le calcul de commission Soluvia.
 *
 * Whitelist : types commissionnes. Whitelist intentionnellement minimale,
 *   un nouveau type doit etre explicitement ajoute ici via PR.
 * Blacklist : types ignores silencieusement (frais OPCO non rentrant dans
 *   la convention commerciale Soluvia, ex. premier equipement informatique).
 * Unknown : tout autre type → contrat verrouille (lock_reason=unknown_line_type)
 *   tant que la decision humaine n'a pas eu lieu (whitelist ou blacklist).
 *
 * Voir spec : docs/superpowers/specs/2026-05-12-base-commission-pedago-design.md
 */

export const WHITELIST_LINE_TYPES = ['PEDAGOGIE'] as const;
export const BLACKLIST_LINE_TYPES = ['PREMIEREQUIPEMENT'] as const;

export type LineTypeClass = 'whitelist' | 'blacklist' | 'unknown';

export function classifyLineType(t: string): LineTypeClass {
  if ((WHITELIST_LINE_TYPES as readonly string[]).includes(t)) return 'whitelist';
  if ((BLACKLIST_LINE_TYPES as readonly string[]).includes(t)) return 'blacklist';
  return 'unknown';
}
