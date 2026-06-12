'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { AlertCircle, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { matchesSearch } from '@/lib/utils/search';
import { DataTableToolbar, type FilterOption } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  defaultSort?: { id: string; desc: boolean };
  filters?: FilterOption[];
  /** Affiche des lignes skeleton a la place du corps du tableau. */
  isLoading?: boolean;
  /** Affiche un etat d'erreur a la place du corps du tableau. */
  error?: string | null;
  onRetry?: () => void;
  /** Message de l'etat vide (defaut : « Aucun résultat. »). */
  emptyMessage?: ReactNode;
  /** Active la colonne de selection (checkbox). Une fonction permet de
   * desactiver la selection ligne par ligne. */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  /** Barre d'actions groupees affichee quand au moins une ligne est
   * selectionnee. Recoit les lignes selectionnees et un reset. */
  renderBulkActions?: (rows: TData[], clearSelection: () => void) => ReactNode;
  getRowId?: (row: TData, index: number) => string;
  initialPageSize?: number;
  /** 'always' (defaut) : barre de pagination toujours visible.
   * 'auto' : masquee tant que tout tient sur une page (sections embarquees). */
  paginationMode?: 'always' | 'auto';
  /** Hauteur max du conteneur : active le scroll vertical interne et le
   * header collant (ex. '60vh', '480px'). */
  maxHeight?: string;
  /** Contenu additionnel a droite de la toolbar (ex. bouton d'ajout). */
  toolbarExtra?: ReactNode;
}

/**
 * Global filter function: searches across all visible leaf columns.
 * Accent-insensitive, case-insensitive, multi-token (space = AND).
 */
function globalFilterFn<TData>(
  row: Row<TData>,
  _columnId: string,
  filterValue: string,
): boolean {
  if (!filterValue) return true;
  // Stringify every cell of every visible leaf column of this row.
  const haystack = row
    .getVisibleCells()
    .map((cell) => {
      const v = cell.getValue();
      if (v == null) return '';
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v);
        } catch {
          return '';
        }
      }
      return String(v);
    })
    .join(' ');
  return matchesSearch(haystack, filterValue);
}

const SKELETON_ROWS = 5;

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Rechercher...',
  onRowClick,
  defaultSort,
  filters,
  isLoading = false,
  error = null,
  onRetry,
  emptyMessage = 'Aucun résultat.',
  enableRowSelection,
  renderBulkActions,
  getRowId,
  initialPageSize = 25,
  paginationMode = 'always',
  maxHeight,
  toolbarExtra,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort ? [defaultSort] : [],
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const allColumns = useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<TData, TValue> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(Boolean(checked))
          }
          aria-label="Sélectionner toutes les lignes de la page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
          onClick={(e) => e.stopPropagation()}
          aria-label="Sélectionner la ligne"
        />
      ),
      size: 36,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
    globalFilterFn: globalFilterFn as FilterFn<TData>,
    onGlobalFilterChange: setGlobalFilter,
    enableRowSelection: enableRowSelection ?? false,
    onRowSelectionChange: setRowSelection,
    getRowId,
    initialState: {
      pagination: { pageIndex: 0, pageSize: initialPageSize },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      globalFilter,
      rowSelection,
    },
  });

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original);

  const { pageIndex, pageSize } = table.getState().pagination;
  const filteredTotal = table.getFilteredRowModel().rows.length;
  const showPagination =
    paginationMode === 'always' || filteredTotal > pageSize || pageIndex > 0;

  const visibleColumnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchKey={searchKey}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        extra={toolbarExtra}
      />
      <div
        className={`border-border overflow-x-auto rounded-lg border ${
          maxHeight ? 'overflow-y-auto' : ''
        }`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <Table
          style={{
            width: '100%',
            minWidth: table.getCenterTotalSize(),
          }}
        >
          <TableHeader
            className={
              maxHeight ? 'bg-card sticky top-0 z-10 shadow-sm' : undefined
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="relative select-none"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanResize() && (
                      // Separator semantique pour redimensionnement de colonne.
                      // role="separator" est non-interactif au sens ARIA mais
                      // recoit des event listeners (drag) - le pattern est
                      // accepte (cf. WAI-ARIA Authoring Practices "Separator").
                      // oxlint-disable-next-line react-doctor/interactive-supports-focus
                      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                      <div
                        // oxlint-disable-next-line react-doctor/prefer-tag-over-role
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner la colonne ${header.column.id}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`hover:bg-primary absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none transition-colors select-none ${
                          header.column.getIsResizing()
                            ? 'bg-primary'
                            : 'bg-transparent'
                        }`}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="h-24">
                  <div className="text-destructive flex flex-col items-center justify-center gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Réessayer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i} aria-hidden="true">
                  {table.getVisibleLeafColumns().map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={
                    onRowClick
                      ? 'focus-visible:bg-muted/50 cursor-pointer outline-none'
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (
                            (e.key === 'Enter' || e.key === ' ') &&
                            e.target === e.currentTarget
                          ) {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={visibleColumnCount}
                  className="text-muted-foreground h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {renderBulkActions && selectedRows.length > 0 && (
        <div className="bg-muted/50 border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">
              {selectedRows.length} sélectionnée
              {selectedRows.length > 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => table.resetRowSelection()}
            >
              <X className="mr-1 size-3.5" />
              Tout désélectionner
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {renderBulkActions(selectedRows, () => table.resetRowSelection())}
          </div>
        </div>
      )}
      {showPagination && <DataTablePagination table={table} />}
    </div>
  );
}
