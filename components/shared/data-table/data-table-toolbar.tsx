'use client';

import type { Table } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchKey?: string;
  searchPlaceholder?: string;
}

export function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder = 'Rechercher...',
}: DataTableToolbarProps<TData>) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-2">
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
      </div>
    </div>
  );
}
