'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterVariant = 'text' | 'select' | 'none';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
  filterVariant?: FilterVariant;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  filterVariant,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const canSort = column.getCanSort();
  const showFilter =
    filterVariant && filterVariant !== 'none' && column.getCanFilter();

  if (!canSort && !showFilter) {
    return <div className={className}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {canSort ? (
        <button
          className="flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={`Trier par ${title}`}
        >
          {title}
          {column.getIsSorted() === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : column.getIsSorted() === 'desc' ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="text-xs font-semibold tracking-wider uppercase">
          {title}
        </span>
      )}
      {showFilter && (
        <button
          aria-label={`Filtrer par ${title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
