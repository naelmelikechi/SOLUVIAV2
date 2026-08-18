/**
 * Agregation numerique des colonnes de data-table (barre type Excel).
 * Logique pure, isolee du composant pour etre testable sans React.
 */

export type AggregateType = 'sum' | 'avg';

export interface AggregateComputation {
  value: number;
  /** Nombre de valeurs numeriques effectivement prises en compte. */
  count: number;
}

/**
 * Agrege une liste de valeurs de cellules. Seuls les nombres finis comptent :
 * null/undefined/NaN/chaines sont ignores (une colonne montant peut contenir
 * des lignes sans valeur, ex. facture brouillon sans TTC).
 * Retourne null si aucune valeur numerique - la barre n'affiche alors rien
 * pour cette colonne plutot qu'un 0 trompeur.
 */
export function aggregateValues(
  values: unknown[],
  type: AggregateType,
): AggregateComputation | null {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  if (count === 0) return null;
  return { value: type === 'avg' ? sum / count : sum, count };
}

const numberFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
});

/** Format par defaut des agregats : nombre francais, 2 decimales max. */
export function formatAggregate(value: number): string {
  return numberFormat.format(value);
}
