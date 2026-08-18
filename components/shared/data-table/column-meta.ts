import type { RowData } from '@tanstack/react-table';
import type { AggregateType } from '@/lib/utils/table-aggregates';

/**
 * Augmentation du typage meta des colonnes TanStack pour tout le socle
 * DataTable. Les casts historiques `meta as { label?: string }` restent
 * valides ; les nouvelles proprietes pilotent la barre d'agregats.
 */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Libelle lisible de la colonne (menu Colonnes, barre d'agregats). */
    label?: string;
    /**
     * Active la colonne dans la barre d'agregats (somme ou moyenne des
     * lignes filtrees, ou de la selection si des lignes sont cochees).
     * 'sum' pour les montants/compteurs/heures, 'avg' pour les pourcentages.
     */
    aggregate?: AggregateType;
    /**
     * Rendu de la valeur agregee (defaut : nombre francais 2 decimales).
     * Ex. formatCurrency pour les montants, (v) => `${Math.round(v)} %`.
     */
    aggregateFormat?: (value: number) => string;
    /**
     * Valeur numerique de la ligne pour l'agregat quand l'accessor de la
     * colonne ne renvoie pas directement un nombre (ex. cellule composite).
     */
    aggregateValue?: (row: TData) => number | null | undefined;
  }
}
