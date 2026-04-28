'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { matchesSearch } from '@/lib/utils/search';

interface TableSearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}

export function TableSearchInput({
  value,
  onChange,
  placeholder = 'Rechercher...',
  className,
}: TableSearchInputProps) {
  return (
    <div className={`relative max-w-sm flex-1 ${className ?? ''}`}>
      <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

/**
 * Filtre une liste sur une recherche multi-token, accent-insensitive.
 * `getHaystack` retourne la chaine brute concatenant les champs cherchables
 * (titre, ref, notes, etc.). Le helper se charge de la normalisation.
 */
export function filterBySearch<T>(
  rows: T[],
  search: string,
  getHaystack: (row: T) => string,
): T[] {
  if (!search.trim()) return rows;
  return rows.filter((row) => matchesSearch(getHaystack(row), search));
}
