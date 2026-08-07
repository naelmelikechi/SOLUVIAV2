import type { QualityDeliverableStatus } from '@/lib/eduvia/quality-types';

/**
 * Un livrable du referentiel Qualiopi, aplati jusqu'a son indicateur et son
 * critere. Juste ce qu'il faut pour grouper par indicateur : c'est l'unite a
 * laquelle un CDP agit ("deposer les preuves de l'indicateur 12"), pas le
 * livrable isole ni le critere entier.
 */
export interface ReferentielDeliverable {
  deliverableId: number;
  criterionId: number;
  criterionPrefix: string;
  indicatorId: number;
  indicatorCode: string;
  indicatorTitle: string;
}

export interface ResteAFaireGroup {
  criterionId: number;
  criterionPrefix: string;
  indicatorId: number;
  indicatorCode: string;
  indicatorTitle: string;
  /** Nombre de couples (livrable, campus) non conformes pour cet indicateur. */
  manquants: number;
  /** Gain en points de pourcentage si l'indicateur passe a 100% conforme. */
  gain: number;
}

export interface ResteAFaireResult {
  /** Les groupes les plus rentables, plafonnes a PLAFOND_GROUPES. */
  groups: ResteAFaireGroup[];
  /** Nombre total de groupes avec au moins un manquant, avant plafonnage. */
  totalGroupes: number;
}

/**
 * Au-dela de 10 groupes, la page redevient un referentiel complet et perd sa
 * raison d'etre (une liste d'actions courte). Le total est expose a cote pour
 * afficher "10 premiers sur 34" plutot que de tronquer en silence.
 */
export const PLAFOND_GROUPES = 10;

/**
 * Calcule le reste a faire Qualiopi, priorise par gain de points.
 *
 * Denominateur identique a computeQualiopiCompletion (lib/queries/qualiopi-stats.ts) :
 * nb livrables du referentiel * nb campus. On ne compte pas `statuses.length`
 * car Eduvia ne cree une ligne de statut qu'a partir de la premiere preuve
 * deposee : un livrable vierge serait sinon exclu et gonflerait le ratio (et
 * ici, disparaitrait purement et simplement du reste a faire).
 *
 * `statuses` est une liste a plat, tous campus confondus (comme
 * `statusesByCampus` aplati dans qualiopi-stats.ts) : chaque entree
 * `conform` pour un `deliverable_id` compte pour un campus ou ce livrable est
 * a jour. Le nombre de manquants d'un livrable est donc
 * `nbCampus - (nb d'entrees conform pour ce livrable)`, borne a 0.
 */
export function resteAFaireQualiopi(
  referentiel: ReferentielDeliverable[],
  statuses: Pick<QualityDeliverableStatus, 'deliverable_id' | 'status'>[],
  nbCampus: number,
): ResteAFaireResult {
  const denominateur = referentiel.length * nbCampus;
  // Referentiel vide ou zero campus : denominateur nul, pas de division par
  // zero, et de toute facon rien a prioriser.
  if (denominateur === 0) return { groups: [], totalGroupes: 0 };

  const conformesParLivrable = new Map<number, number>();
  for (const s of statuses) {
    if (s.status !== 'conform') continue;
    conformesParLivrable.set(
      s.deliverable_id,
      (conformesParLivrable.get(s.deliverable_id) ?? 0) + 1,
    );
  }

  interface Accumulateur {
    criterionId: number;
    criterionPrefix: string;
    indicatorCode: string;
    indicatorTitle: string;
    manquants: number;
  }
  const parIndicateur = new Map<number, Accumulateur>();

  for (const d of referentiel) {
    const conformes = conformesParLivrable.get(d.deliverableId) ?? 0;
    const manquants = Math.max(0, nbCampus - conformes);
    if (manquants === 0) continue; // livrable conforme partout : rien a faire

    const existing = parIndicateur.get(d.indicatorId);
    if (existing) {
      existing.manquants += manquants;
    } else {
      parIndicateur.set(d.indicatorId, {
        criterionId: d.criterionId,
        criterionPrefix: d.criterionPrefix,
        indicatorCode: d.indicatorCode,
        indicatorTitle: d.indicatorTitle,
        manquants,
      });
    }
  }

  const groupes: ResteAFaireGroup[] = Array.from(parIndicateur.entries()).map(
    ([indicatorId, v]) => ({
      criterionId: v.criterionId,
      criterionPrefix: v.criterionPrefix,
      indicatorId,
      indicatorCode: v.indicatorCode,
      indicatorTitle: v.indicatorTitle,
      manquants: v.manquants,
      gain: (v.manquants / denominateur) * 100,
    }),
  );

  // Tri par gain decroissant ; a egalite, par code d'indicateur croissant.
  // Sans cle secondaire, l'ordre d'iteration d'un Map ne suffit pas a garantir
  // un affichage stable d'un rafraichissement a l'autre.
  groupes.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain;
    return a.indicatorCode.localeCompare(b.indicatorCode, 'fr');
  });

  return {
    groups: groupes.slice(0, PLAFOND_GROUPES),
    totalGroupes: groupes.length,
  };
}
