export interface RegleArchivage {
  id: string;
  nom: string;
  etat_source: string;
  delai_jours: number;
  actif: boolean;
}

export interface ContratArchivable {
  id: string;
  contract_state: string | null;
  archive: boolean;
  /** Pose par trigger au vrai changement d'etat. ISO complet ou court. */
  contract_state_changed_at: string | null;
  /** Au moins une facture emise porte ce contrat. Garde-fou. */
  aDesFacturesEmises: boolean;
}

export interface DecisionArchivage {
  contratId: string;
  regleId: string;
  regleNom: string;
  joursDansEtat: number;
}

function joursEntre(debutIso: string, finIso: string): number {
  const d = Date.parse(debutIso);
  const f = Date.parse(`${finIso}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

/**
 * Contrats a sortir de la production, selon les regles actives.
 *
 * Garde-fou non negociable : un contrat portant une facture emise n'est
 * JAMAIS archive automatiquement. Archiver retire de la production ; le faire
 * sur un contrat deja facture creuserait un ecart entre la production affichee
 * et le chiffre reellement facture, sur une numerotation qu'on ne peut pas
 * corriger a posteriori (gapless, obligation legale).
 */
export function contratsAArchiver(
  contrats: ContratArchivable[],
  regles: RegleArchivage[],
  aujourdHui: string,
): DecisionArchivage[] {
  const parEtat = new Map<string, RegleArchivage>();
  for (const r of regles) {
    if (r.actif) parEtat.set(r.etat_source, r);
  }
  if (parEtat.size === 0) return [];

  const decisions: DecisionArchivage[] = [];
  for (const c of contrats) {
    if (c.archive) continue;
    if (c.aDesFacturesEmises) continue;
    if (!c.contract_state || !c.contract_state_changed_at) continue;

    const regle = parEtat.get(c.contract_state);
    if (!regle) continue;

    const jours = joursEntre(c.contract_state_changed_at, aujourdHui);
    if (jours > regle.delai_jours) {
      decisions.push({
        contratId: c.id,
        regleId: regle.id,
        regleNom: regle.nom,
        joursDansEtat: jours,
      });
    }
  }
  return decisions;
}
