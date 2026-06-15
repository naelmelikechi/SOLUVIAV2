const ABANDON_STATES = new Set(['resilie', 'ANNULE']);

export function computeTauxAbandon(
  contrats: Array<{ contract_state: string }>,
): number {
  if (contrats.length === 0) return 0;
  const abandons = contrats.filter((c) =>
    ABANDON_STATES.has(c.contract_state),
  ).length;
  return Math.round((abandons / contrats.length) * 10000) / 100;
}

export function computeTauxFinancement(
  contrats: Array<{ npec_amount: number | null }>,
  totalFactureHt: number,
): number {
  const npecTotal = contrats.reduce((s, c) => s + (c.npec_amount ?? 0), 0);
  if (npecTotal === 0) return 0;
  return Math.round((totalFactureHt / npecTotal) * 10000) / 100;
}

export function computePedagogieAvancement(
  contrats: Array<{
    // PostgREST renvoie un objet (relation 1-1 via UNIQUE(contrat_id)) d'apres le
    // type genere, parfois un tableau : on tolere les deux + null (cf. Sentry
    // SOLUVIA-13 "(contrats_progressions ?? []).map is not a function").
    contrats_progressions:
      | Array<{ progression_percentage: number }>
      | { progression_percentage: number }
      | null;
  }>,
): number {
  const progressions = contrats.flatMap((c) => {
    const cp = c.contrats_progressions;
    const rows = Array.isArray(cp) ? cp : cp ? [cp] : [];
    return rows.map((p) => p.progression_percentage);
  });
  if (progressions.length === 0) return 0;
  const sum = progressions.reduce((s, v) => s + v, 0);
  return Math.round((sum / progressions.length) * 100) / 100;
}

export function groupContratsByType(
  contrats: Array<{ contract_type: string | null }>,
): { app: number; pdc: number; poe: number } {
  const counts = { app: 0, pdc: 0, poe: 0 };
  for (const c of contrats) {
    switch (c.contract_type) {
      case 'APP':
        counts.app++;
        break;
      case 'PDC':
        counts.pdc++;
        break;
      case 'POE':
        counts.poe++;
        break;
    }
  }
  return counts;
}
