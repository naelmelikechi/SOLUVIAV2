import { diffDaysIso } from '@/lib/utils/dates';

/**
 * Texte "Modalites de paiement" par defaut, utilise quand aucune
 * `conditions_reglement` n'est saisie sur la facture.
 *
 * Le delai est derive directement des dates d'emission/echeance de la
 * facture : il reste donc toujours coherent avec l'echeance affichee, quelle
 * que soit la valeur du parametre `facturation.delai_echeance_jours`.
 *
 * MUST rester identique entre le PDF et l'email (Art. L441-10 II : les
 * modalites de reglement ne sont opposables au client que si elles sont
 * mentionnees -> PDF et email doivent dire exactement la meme chose). C'est
 * la raison d'etre de ce helper partage.
 */
export function reglementParDefaut(
  dateEmission: string | null | undefined,
  dateEcheance: string | null | undefined,
): string {
  const jours =
    dateEmission && dateEcheance
      ? diffDaysIso(dateEmission, dateEcheance)
      : null;
  return jours != null && jours > 0
    ? `Règlement par virement bancaire sous ${jours} jours.`
    : 'Règlement par virement bancaire.';
}
