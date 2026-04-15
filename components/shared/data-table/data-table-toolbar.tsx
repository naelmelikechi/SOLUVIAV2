'use client';

import type { Table } from '@tanstack/react-table';
import { Search, ListFilter, X } from 'lucide-react';
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

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
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
    const value = table.getColumn(filter.column)?.getFilterValue() as
      | string[]
      | undefined;
    return count + (value?.length ?? 0);
  }, 0);

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {searchKey && (
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={searchPlaceholder}
              value={
                (table.getColumn(searchKey)?.getFilterValue() as string) ?? ''
              }
              onChange={(event) =>
                table.getColumn(searchKey)?.setFilterValue(event.target.value)
              }
              className="pl-9"
            />
          </div>
        )}
        {filters.map((filter) => {
          const column = table.getColumn(filter.column);
          const selectedValues = (column?.getFilterValue() as string[]) ?? [];

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
                      onCheckedChange={() => {
                        const next = isChecked
                          ? selectedValues.filter((v) => v !== option.value)
                          : [...selectedValues, option.value];
                        column?.setFilterValue(
                          next.length > 0 ? next : undefined,
                        );
                      }}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {selectedValues.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => column?.setFilterValue(undefined)}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Effacer
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
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
