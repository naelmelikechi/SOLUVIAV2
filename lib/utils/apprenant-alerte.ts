/**
 * Alerte "formation demarree, contrat non engage".
 *
 * Un apprenant dont la formation a officiellement commence (date de debut de
 * contrat passee) mais dont le dossier est reste au brouillon cote Eduvia
 * (NOTSENT) ou a ete archive (ARCHIVE) est une anomalie : il n'est ni
 * facturable ni suivi, alors qu'il est cense etre en formation.
 *
 * Les etats retenus sont volontairement limites a ces deux la : TRANSMIS et
 * EN_COURS_INSTRUCTION sont des etapes normales de l'instruction OPCO, pas des
 * anomalies. Cf. docs/superpowers/specs/2026-08-05-fiche-projet-apprenants-depose-documents-design.md
 */
export const ETATS_CONTRAT_NON_ENGAGE = new Set(['NOTSENT', 'ARCHIVE']);

/**
 * @param dateDebut date de debut du contrat au format ISO `YYYY-MM-DD`
 * @param contractState etat Eduvia du contrat
 * @param todayIso date du jour au format `YYYY-MM-DD` (injectable pour les tests)
 */
export function isApprenantEnAlerte(
  dateDebut: string | null | undefined,
  contractState: string | null | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!dateDebut || !contractState) return false;
  if (!ETATS_CONTRAT_NON_ENGAGE.has(contractState)) return false;
  // Comparaison lexicographique valide sur du ISO `YYYY-MM-DD`, et immunisee
  // aux decalages de fuseau d'un `new Date(...)`. Strictement anterieure : un
  // contrat qui demarre aujourd'hui n'est pas encore en retard.
  return dateDebut.slice(0, 10) < todayIso;
}
