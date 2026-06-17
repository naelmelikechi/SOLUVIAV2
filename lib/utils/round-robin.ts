/**
 * Affectation équitable d'un développeur commercial (round-robin pondéré par la
 * charge), utilisée par le connecteur LinkedIn pour distribuer les prospects
 * entrants (Feature 9).
 *
 * Logique pure et déterministe : aucune dépendance runtime, testable seule.
 *
 * @param devIds        Identifiants des développeurs éligibles, dans un ordre
 *                      stable. L'ordre départage les égalités de charge.
 * @param chargeParDev  Nombre d'évènements récents déjà à la charge de chaque
 *                      développeur. Une entrée absente vaut 0 — un développeur
 *                      jamais affecté est donc prioritaire.
 * @returns L'identifiant du développeur le moins chargé, ou `null` si la liste
 *          des éligibles est vide (l'appelant laisse alors le prospect non
 *          assigné).
 */
export function nextRoundRobinDeveloppeur(
  devIds: string[],
  chargeParDev: Record<string, number>,
): string | null {
  let chosen: string | null = null;
  let minCharge = Number.POSITIVE_INFINITY;
  // Comparaison stricte `<` : à charge égale, le premier de `devIds` reste élu
  // (départage déterministe).
  for (const id of devIds) {
    const charge = chargeParDev[id] ?? 0;
    if (charge < minCharge) {
      chosen = id;
      minCharge = charge;
    }
  }
  return chosen;
}
