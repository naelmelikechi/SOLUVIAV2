import type { BadgeColor } from '@/components/shared/status-badge';

// Libelles et couleurs d'affichage des etats de contrat (Eduvia + interne).
// Source unique : ces tables etaient dupliquees dans trois composants, et la
// copie oubliee a fait disparaitre les libelles d'ARCHIVE et RUPTURE, pourtant
// presents en prod (badge vide, couleur par defaut).
export const CONTRACT_STATE_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
  termine: 'Terminé',
  NOTSENT: 'Pas envoyé',
  TRANSMIS: 'Transmis',
  EN_COURS_INSTRUCTION: "En cours d'instruction",
  ENGAGE: 'Engagé',
  ANNULE: 'Annulé',
  ARCHIVE: 'Archivé',
  RUPTURE: 'Rupture',
};

export const CONTRACT_STATE_COLORS: Record<string, BadgeColor> = {
  actif: 'green',
  suspendu: 'orange',
  resilie: 'red',
  termine: 'gray',
  NOTSENT: 'gray',
  TRANSMIS: 'blue',
  EN_COURS_INSTRUCTION: 'orange',
  ENGAGE: 'green',
  ANNULE: 'red',
  ARCHIVE: 'gray',
  RUPTURE: 'red',
};

/** Libelle lisible d'un etat de contrat, avec repli sur la valeur brute. */
export function getContratStateLabel(state: string | null | undefined): string {
  if (!state) return '-';
  return CONTRACT_STATE_LABELS[state] ?? state;
}

/** Couleur de badge d'un etat de contrat, gris par defaut. */
export function getContratStateColor(
  state: string | null | undefined,
): BadgeColor {
  if (!state) return 'gray';
  return CONTRACT_STATE_COLORS[state] ?? 'gray';
}

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
