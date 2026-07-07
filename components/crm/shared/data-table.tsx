'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/crm/ui/table';
import { Input } from '@/components/crm/ui/input';

export function DataTable<TData, TValue>({
  columns,
  data,
  filterPlaceholder = 'Filtrer…',
  emptyState,
  rowTint,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterPlaceholder?: string;
  /** Affiché quand la donnée est réellement vide (0 ligne), ex. CTA « créer le premier… ». */
  emptyState?: ReactNode;
  /** Couleur (hex) de teinte de fond d'une ligne, ex. couleur d'étape. */
  rowTint?: (row: TData) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table gère sa propre mémoïsation
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  // Donnée réellement vide (≠ filtre sans résultat) : onboarding plutôt qu'un tableau vide.
  if (data.length === 0 && emptyState) {
    return (
      <div className="border-border bg-card/50 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {emptyState}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder={filterPlaceholder}
        aria-label={filterPlaceholder}
        className="max-w-xs"
      />
      <div className="border-border bg-card/50 overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const tint = rowTint?.(row.original);
                return (
                  <TableRow
                    key={row.id}
                    // Variable CSS + classes (plutôt qu'un backgroundColor inline) : préserve le hover: et le mode sombre.
                    style={
                      tint
                        ? ({ '--row-tint': tint } as CSSProperties)
                        : undefined
                    }
                    className={
                      tint
                        ? 'bg-[color-mix(in_srgb,var(--row-tint)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--row-tint)_28%,transparent)] dark:bg-[color-mix(in_srgb,var(--row-tint)_16%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--row-tint)_24%,transparent)]'
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {globalFilter
                    ? 'Aucun résultat pour ce filtre.'
                    : 'Aucun résultat.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
