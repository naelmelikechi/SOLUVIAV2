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

// Statuts "contrat rompu" : declenchent un ajustement pro-rata (avoir).
// Inclut les libelles Eduvia connus et leurs variantes francaises.
// Centralise pour qu'une nouvelle valeur Eduvia se propage partout.
export const TERMINATION_CONTRACT_STATES = new Set([
  'resilie',
  'ANNULE',
  'rupture',
  'rompu',
  'abandon',
  'abandonne',
]);

export function isContratActif(
  contractState: string | null | undefined,
): boolean {
  return contractState != null && ACTIVE_CONTRACT_STATES.has(contractState);
}

export function isContratRompu(
  contractState: string | null | undefined,
): boolean {
  return (
    contractState != null && TERMINATION_CONTRACT_STATES.has(contractState)
  );
}
