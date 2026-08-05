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

/**
 * Comparaison insensible a la casse : la prod porte 'RUPTURE' en MAJUSCULES
 * alors que le Set liste 'rupture'. Avec un `Set.has` strict, ces contrats
 * n'etaient ni actifs ni rompus - donc aucun avoir prorata et une production
 * qui courait jusqu'au terme initial. La casse d'Eduvia n'est pas un contrat
 * d'API : on normalise.
 *
 * `isContratActif` reste volontairement strict (cf. tests) : ses libelles sont
 * des constantes Eduvia MAJUSCULES + l'unique statut interne 'actif', et un
 * elargissement y changerait le perimetre de facturation.
 */
const TERMINATION_STATES_NORMALISES = new Set(
  [...TERMINATION_CONTRACT_STATES].map((s) => s.toLowerCase()),
);

export function isContratRompu(
  contractState: string | null | undefined,
): boolean {
  return (
    contractState != null &&
    TERMINATION_STATES_NORMALISES.has(contractState.toLowerCase())
  );
}
