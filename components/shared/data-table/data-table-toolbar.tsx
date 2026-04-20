'use client';

import type { Table, Column } from '@tanstack/react-table';
import { Search, ListFilter, X, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

export interface FilterOption {
  column: string;
  label: string;
  options: { label: string; value: string }[];
}

// Helper: extract a readable label for a column. Prefers meta.label,
// then the header if it's a plain string, then the column id.
function getColumnLabel<TData>(col: Column<TData, unknown>): string {
  const meta = col.columnDef.meta as { label?: string } | undefined;
  if (meta?.label) return meta.label;
  const header = col.columnDef.header;
  if (typeof header === 'string') return header;
  return col.id;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  /**
   * Legacy prop - kept only as a flag to show/hide the search input.
   * The actual search is now global across all visible columns.
   */
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: FilterOption[];
}

export function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder = 'Rechercher...',
  filters = [],
}: DataTableToolbarProps<TData>) {
  const activeFilterCount = filters.reduce((count, filter) => {
    const value = table.getColumn(filter.column)?.getFilterValue();
    return count + (Array.isArray(value) ? value.length : 0);
  }, 0);

  const showSearch = searchKey !== undefined;
  const globalFilter =
    (table.getState().globalFilter as string | undefined) ?? '';

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              className="pl-9"
            />
          </div>
        )}
        {filters.map((filter) => {
          const column = table.getColumn(filter.column);
          const rawValue = column?.getFilterValue();
          const selectedValues: string[] = Array.isArray(rawValue)
            ? (rawValue as string[])
            : [];

          const setValues = (next: string[]) => {
            column?.setFilterValue(next.length > 0 ? next : undefined);
          };

          return (
            <DropdownMenu key={filter.column}>
              <DropdownMenuTrigger className="bg-background border-input hover:bg-accent hover:text-accent-foreground inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors">
                <ListFilter className="h-3.5 w-3.5" />
                {filter.label}
                {selectedValues.length > 0 && (
                  <Badge
                    variant="default"
                    className="ml-1 h-4 min-w-4 px-1 text-[10px]"
                  >
                    {selectedValues.length}
                  </Badge>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {filter.options.map((option) => {
                  const isChecked = selectedValues.includes(option.value);
                  return (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const shouldBeIn = Boolean(checked);
                        const next = shouldBeIn
                          ? selectedValues.includes(option.value)
                            ? selectedValues
                            : [...selectedValues, option.value]
                          : selectedValues.filter((v) => v !== option.value);
                        setValues(next);
                      }}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {selectedValues.length > 0 && (
                  <DropdownMenuItem onClick={() => setValues([])}>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Effacer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
        {(() => {
          const hidableColumns = table
            .getAllLeafColumns()
            .filter((col) => col.getCanHide());
          if (hidableColumns.length === 0) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="bg-background border-input hover:bg-accent hover:text-accent-foreground inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors">
                <Settings2 className="h-3.5 w-3.5" />
                Colonnes
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Colonnes à afficher</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hidableColumns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  >
                    {getColumnLabel(col)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              for (const filter of filters) {
                table.getColumn(filter.column)?.setFilterValue(undefined);
              }
            }}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Effacer les filtres
          </Button>
        )}
      </div>
    </div>
  );
}
