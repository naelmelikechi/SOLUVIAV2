/**
 * Statistiques géographiques dérivées des opportunités.
 * Fonctions pures (aucun accès réseau/DB) → testables isolément.
 */

export type OppRegions = {
  statut: string;
  nb_alternants?: number | null;
  date_demarrage_souhaitee?: string | null;
  compte: { adresses: { region: string | null }[] | null } | null;
};

/**
 * Agrège une valeur par région sur les opportunités OUVERTES.
 * - Régions distinctes par opp (multi-sites même région → une fois) ; une opp sur
 *   deux régions différentes ajoute sa valeur dans chacune.
 * - `extractValeur` : `() => 1` (nombre d'opps) ou `o => o.nb_alternants ?? 0`, etc.
 * - Une région présente avec valeur 0 reste dans le résultat (à 0).
 */
export function aggregateParRegion(
  opps: OppRegions[],
  extractValeur: (o: OppRegions) => number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const o of opps) {
    if (o.statut !== 'ouverte') continue;
    const regions = new Set<string>();
    for (const a of o.compte?.adresses ?? []) {
      if (a.region) regions.add(a.region);
    }
    const valeur = extractValeur(o);
    for (const r of regions) totals[r] = (totals[r] ?? 0) + valeur;
  }
  return totals;
}

/** Nombre d'opportunités OUVERTES par région (cas particulier : valeur = 1). */
export function countParRegion(opps: OppRegions[]): Record<string, number> {
  return aggregateParRegion(opps, () => 1);
}

/** Nombre d'opps OUVERTES non géolocalisées (absentes de la carte). */
export function countNonGeolocalisees(opps: OppRegions[]): number {
  return opps.filter(
    (o) =>
      o.statut === 'ouverte' &&
      !(o.compte?.adresses ?? []).some((a) => !!a.region),
  ).length;
}

/** % d'opps OUVERTES géolocalisées (0 si aucune opp ouverte). Entier arrondi. */
export function tauxGeolocalisation(opps: OppRegions[]): number {
  const ouvertes = opps.filter((o) => o.statut === 'ouverte');
  if (ouvertes.length === 0) return 0;
  const geo = ouvertes.filter((o) =>
    (o.compte?.adresses ?? []).some((a) => !!a.region),
  ).length;
  return Math.round((100 * geo) / ouvertes.length);
}

export type FenetreRentree = { debut: string; fin: string };

/**
 * Fenêtre « rentrée » (août→octobre) de l'année scolaire visée, en "YYYY-MM-DD".
 * Avant novembre → année courante ; à partir de novembre → année suivante.
 * `ref` injectable pour la testabilité (défaut = maintenant). Granularité au mois
 * → l'écart de fuseau horaire est sans effet.
 */
export function fenetreRentree(ref: Date = new Date()): FenetreRentree {
  const y =
    ref.getUTCMonth() >= 10 ? ref.getUTCFullYear() + 1 : ref.getUTCFullYear();
  return { debut: `${y}-08-01`, fin: `${y}-10-31` };
}

/**
 * Garde les opps dont `date_demarrage_souhaitee` ∈ [debut, fin] (bornes incluses).
 * Comparaison lexicographique sur "YYYY-MM-DD" = chronologique (format ISO,
 * colonne `date` Postgres). Les dates nulles sont exclues.
 */
export function filtreRentree(
  opps: OppRegions[],
  f: FenetreRentree,
): OppRegions[] {
  return opps.filter((o) => {
    const d = o.date_demarrage_souhaitee;
    return !!d && d >= f.debut && d <= f.fin;
  });
}
