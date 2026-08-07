import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import {
  progressionApprenant,
  type StatutProgression,
} from '@/lib/projets/progression';

/**
 * Une ligne de la section Apprenants : soit un apprenant porte par un contrat,
 * soit un eleve cree dans Eduvia sans contrat encore etabli ("brouillon").
 * Ces derniers n'ont aucune date : l'API Eduvia ne porte plus de date de
 * formation sur la fiche apprenant, seulement sur le contrat.
 */
export type ApprenantProjetRow = {
  /** Id du contrat, ou id de l'apprenant pour un eleve sans contrat. */
  id: string;
  source: 'contrat' | 'sans_contrat';
  nom: string;
  prenom: string;
  formation_titre: string | null;
  contract_number: string | null;
  date_debut: string | null;
  date_fin: string | null;
  /** Etat Eduvia du contrat ; null pour un eleve sans contrat. */
  contract_state: string | null;
  /** `contrats_progressions.progression_percentage`, ou null si jamais
   * synchronisee (ou eleve sans contrat). */
  progression_reelle: number | null;
  /** Part du temps ecoulee entre date_debut et date_fin, en %. */
  progression_theorique: number | null;
  /** progression_reelle - progression_theorique, en points. */
  progression_ecart: number | null;
  progression_statut: StatutProgression;
};

type ContratProgressionEmbed =
  | { progression_percentage: number | null }
  | { progression_percentage: number | null }[]
  | null;

/** L'embed PostgREST d'une relation one-to-one peut arriver en objet ou en
 * tableau selon la version des types generes : on gere les deux. */
function progressionPercentage(embed: ContratProgressionEmbed): number | null {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.progression_percentage ?? null;
}

function nomComplet(prenom: string | null, nom: string | null): string {
  return `${prenom ?? ''} ${nom ?? ''}`.trim();
}

/**
 * Liste des apprenants d'un projet : contrats non archives + eleves Eduvia
 * rattaches au projet mais sans contrat.
 *
 * Les contrats `archive = true` sont exclus (contrats fantomes, supprimes cote
 * Eduvia), comme partout ailleurs dans l'app.
 */
export async function getApprenantsByProjetId(
  projetId: string,
): Promise<ApprenantProjetRow[]> {
  const supabase = await createClient();

  const aujourdHui = new Date().toISOString().slice(0, 10);

  const [contratsRes, apprenantsRes] = await Promise.all([
    supabase
      .from('contrats')
      .select(
        'id, apprenant_nom, apprenant_prenom, formation_titre, contract_number, date_debut, date_fin, contract_state, eduvia_employee_id, contrats_progressions(progression_percentage)',
      )
      .eq('projet_id', projetId)
      .eq('archive', false),
    supabase
      .from('apprenants')
      .select('id, nom, prenom, eduvia_id')
      .eq('projet_id', projetId),
  ]);

  const error = contratsRes.error ?? apprenantsRes.error;
  if (error) {
    logger.error('queries.apprenants', 'getApprenantsByProjetId failed', {
      projetId,
      error,
    });
    throw new AppError(
      'PROJET_APPRENANTS_FETCH_FAILED',
      'Impossible de charger les apprenants du projet',
      { cause: error },
    );
  }

  const contrats = contratsRes.data ?? [];
  const apprenants = apprenantsRes.data ?? [];

  const lignesContrats: ApprenantProjetRow[] = contrats.map((c) => {
    const progressionReelle = progressionPercentage(
      c.contrats_progressions as ContratProgressionEmbed,
    );
    const progression = progressionApprenant(
      c.date_debut,
      c.date_fin,
      progressionReelle,
      aujourdHui,
    );
    return {
      id: c.id,
      source: 'contrat',
      nom: c.apprenant_nom ?? '',
      prenom: c.apprenant_prenom ?? '',
      formation_titre: c.formation_titre,
      contract_number: c.contract_number,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      contract_state: c.contract_state,
      progression_reelle: progressionReelle,
      progression_theorique: progression.theorique,
      progression_ecart: progression.ecart,
      progression_statut: progression.statut,
    };
  });

  // Un apprenant deja porte par un contrat du projet ne doit pas apparaitre
  // deux fois. Le rapprochement se fait sur l'id Eduvia de l'employe.
  const employesAvecContrat = new Set(
    contrats
      .map((c) => c.eduvia_employee_id)
      .filter((id): id is number => id != null),
  );

  const lignesSansContrat: ApprenantProjetRow[] = apprenants
    .filter((a) => !employesAvecContrat.has(a.eduvia_id))
    .map((a) => ({
      id: a.id,
      source: 'sans_contrat',
      nom: a.nom ?? '',
      prenom: a.prenom ?? '',
      formation_titre: null,
      contract_number: null,
      date_debut: null,
      date_fin: null,
      contract_state: null,
      // Aucun contrat = aucune date = rien a calculer. Statut neutre, jamais
      // un retard invente.
      progression_reelle: null,
      progression_theorique: null,
      progression_ecart: null,
      progression_statut: 'a_jour',
    }));

  // Ordre de base alphabetique : c'est le tri de secours de la table (a
  // egalite d'ecart), et il reste le plus lisible pour toute liste qui
  // n'exploite pas la progression (recherche, export...). Le tri par defaut
  // "plus en retard en premier" est applique cote table via `defaultSort`.
  return [...lignesContrats, ...lignesSansContrat].sort((a, b) =>
    nomComplet(a.prenom, a.nom).localeCompare(
      nomComplet(b.prenom, b.nom),
      'fr',
    ),
  );
}
