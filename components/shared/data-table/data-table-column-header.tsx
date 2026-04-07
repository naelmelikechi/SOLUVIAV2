'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={className}>{title}</div>;
  }

  return (
    <button
      className={cn(
        'flex items-center gap-1 text-xs font-semibold tracking-wider uppercase',
        className,
      )}
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
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
  );
}
