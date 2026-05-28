'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

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
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
