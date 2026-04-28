// Statuts "contrat actif" - couvre l'interne (`actif`) et les statuts Eduvia
// representant un apprenant effectivement en formation ou en cours de validation.
// Exclus : `suspendu`, `resilie`, `termine`, `ANNULE`.
export const ACTIVE_CONTRACT_STATES = new Set([
  'actif',
  'ENGAGE',
  'EN_COURS_INSTRUCTION',
  'TRANSMIS',
  'NOTSENT',
]);

export function isContratActif(
  contractState: string | null | undefined,
): boolean {
  return contractState != null && ACTIVE_CONTRACT_STATES.has(contractState);
}
