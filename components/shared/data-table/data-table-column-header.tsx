'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

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
          type="button"
          className="flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={`Trier par ${title}`}
        >
          {title}
          {column.getIsSorted() === 'asc' ? (
            <ArrowUp className="size-3.5" />
          ) : column.getIsSorted() === 'desc' ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ArrowUpDown className="text-muted-foreground size-3.5" />
          )}
        </button>
      ) : (
        <span className="text-xs font-semibold tracking-wider uppercase">
          {title}
        </span>
      )}
      {showFilter && <TextFilterButton column={column} title={title} />}
    </div>
  );
}

function TextFilterButton<TData, TValue>({
  column,
  title,
}: {
  column: Column<TData, TValue>;
  title: string;
}) {
  const current = (column.getFilterValue() as string | undefined) ?? '';
  const [value, setValue] = useState(current);
  const hasFilter = current.length > 0;

  const debouncedSetFilter = useDebounce((...args: unknown[]) => {
    const v = args[0] as string;
    column.setFilterValue(v || undefined);
  }, 200);

  function handleFilterInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    debouncedSetFilter(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Filtrer par ${title}`}
        className="text-muted-foreground hover:text-foreground relative"
      >
        <Search className="size-3.5" />
        {hasFilter && (
          <span
            data-testid="filter-active-dot"
            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-blue-500"
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Input
          autoFocus
          placeholder={`Rechercher ${title}...`}
          value={value}
          onChange={handleFilterInputChange}
        />
      </PopoverContent>
    </Popover>
  );
}
