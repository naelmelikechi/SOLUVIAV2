import type { LancementStatut } from './constants';

/**
 * Deux alertes distinctes, jamais stockees en base (elles dependent du jour
 * courant, une valeur stockee serait fausse des le lendemain) :
 *
 * - `en_retard` : la date d'objectif est passee et l'etape n'est toujours pas
 *   partie. Le retard est de NOTRE cote, c'est au CDP d'agir.
 * - `enlise` : l'etape est deposee depuis plus longtemps que le seuil sans
 *   etre terminee. L'objectif est tenu, mais le dossier dort chez le tiers
 *   instructeur. Il faut relancer, pas produire.
 *
 * Les confondre ferait porter au CDP la responsabilite d'un delai qui ne lui
 * appartient pas.
 */
export type AlerteEtape = 'en_retard' | 'enlise' | null;

export interface AlerteEtapeInput {
  statut: LancementStatut;
  /** Date d'objectif saisie, format ISO court (AAAA-MM-JJ). */
  dateObjectif: string | null;
  /** Posee par le trigger au passage en depose. Format ISO court. */
  dateRealisation: string | null;
  /** Jour courant, format ISO court. Injecte pour rendre la fonction pure. */
  aujourdHui: string;
  seuilEnlisementJours: number;
}

/** Nombre de jours entiers entre deux dates ISO courtes (AAAA-MM-JJ). */
function joursEntre(debut: string, fin: string): number {
  const d = Date.parse(`${debut}T00:00:00Z`);
  const f = Date.parse(`${fin}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

export function alerteEtape(input: AlerteEtapeInput): AlerteEtape {
  const {
    statut,
    dateObjectif,
    dateRealisation,
    aujourdHui,
    seuilEnlisementJours,
  } = input;

  // Enlisement d'abord : une etape deposee a tenu son objectif, quoi qu'en
  // dise la date d'objectif. Le seul reproche possible est le temps d'attente.
  if (statut === 'depose' && dateRealisation) {
    if (joursEntre(dateRealisation, aujourdHui) > seuilEnlisementJours) {
      return 'enlise';
    }
    return null;
  }

  // Une etape terminee ne peut plus rien signaler.
  if (statut === 'lance') return null;

  // Retard : l'objectif est passe et rien n'est parti. Comparaison de chaines
  // ISO courtes, valide car le format est de longueur fixe et zero-padde.
  if (dateObjectif && !dateRealisation && dateObjectif < aujourdHui) {
    return 'en_retard';
  }

  return null;
}
