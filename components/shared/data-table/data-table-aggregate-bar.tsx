'use client';

import type { Row, Table } from '@tanstack/react-table';
import { Sigma } from 'lucide-react';
import { aggregateValues, formatAggregate } from '@/lib/utils/table-aggregates';

/**
 * Barre d'agregats type Excel : somme/moyenne des colonnes numeriques
 * declarees via meta.aggregate, calculee sur la selection si des lignes
 * sont cochees, sinon sur l'ensemble des lignes filtrees (toutes pages).
 * Invisible tant qu'aucune colonne visible ne declare d'agregat.
 */
export function DataTableAggregateBar<TData>({
  table,
  serverMode = false,
}: {
  table: Table<TData>;
  serverMode?: boolean;
}) {
  const aggregatableColumns = table
    .getVisibleLeafColumns()
    .filter((col) => col.columnDef.meta?.aggregate);
  if (aggregatableColumns.length === 0) return null;

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const hasSelection = selectedRows.length > 0;
  // En mode serveur, getFilteredRowModel est desactive : on agrege les
  // lignes chargees (le libelle le dit explicitement).
  const scopeRows: Row<TData>[] = hasSelection
    ? selectedRows
    : serverMode
      ? table.getRowModel().rows
      : table.getFilteredRowModel().rows;
  if (scopeRows.length === 0) return null;

  const parts = aggregatableColumns.flatMap((col) => {
    const meta = col.columnDef.meta!;
    const type = meta.aggregate!;
    const values = scopeRows.map((row) =>
      meta.aggregateValue
        ? meta.aggregateValue(row.original)
        : row.getValue(col.id),
    );
    const result = aggregateValues(values, type);
    if (result === null) return [];
    const label =
      meta.label ??
      (typeof col.columnDef.header === 'string'
        ? col.columnDef.header
        : col.id);
    const format = meta.aggregateFormat ?? formatAggregate;
    return [
      {
        id: col.id,
        text: `${type === 'avg' ? 'Moy. ' : ''}${label} : ${format(result.value)}`,
      },
    ];
  });
  if (parts.length === 0) return null;

  const scopeLabel = hasSelection
    ? `Sélection : ${scopeRows.length} ligne${scopeRows.length > 1 ? 's' : ''}`
    : `${scopeRows.length} ligne${scopeRows.length > 1 ? 's' : ''}${
        serverMode ? ' chargées' : ''
      }`;

  return (
    <output
      aria-label="Agrégats des colonnes numériques"
      className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums"
    >
      <span className="flex items-center gap-1 font-medium">
        <Sigma className="size-3.5" aria-hidden="true" />
        {scopeLabel}
      </span>
      {parts.map((part) => (
        <span key={part.id} className="whitespace-nowrap">
          {part.text}
        </span>
      ))}
    </output>
  );
}
