'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface CriteriaFilterProps {
  basePath: string;
  current: 'all' | 'qualiopi' | 'eduvia';
}

const OPTIONS: Array<{ value: 'all' | 'qualiopi' | 'eduvia'; label: string }> =
  [
    { value: 'all', label: 'Tous les critères' },
    { value: 'qualiopi', label: 'Qualiopi' },
    { value: 'eduvia', label: 'Eduvia' },
  ];

export function CriteriaFilter({ basePath, current }: CriteriaFilterProps) {
  const { push } = useRouter();

  return (
    <div className="border-border inline-flex items-center rounded-md border bg-white p-0.5 text-xs">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            const url =
              opt.value === 'all'
                ? basePath
                : `${basePath}?filter=${opt.value}`;
            push(url);
          }}
          className={cn(
            'cursor-pointer rounded px-3 py-1 font-medium transition-colors',
            current === opt.value
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
