'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface PeriodToggleProps {
  paramName: string;
  values: [{ value: string; label: string }, { value: string; label: string }];
  defaultValue: string;
}

export function PeriodToggle({
  paramName,
  values,
  defaultValue,
}: PeriodToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get(paramName) ?? defaultValue;

  const setValue = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  return (
    <div className="bg-muted inline-flex rounded-lg p-0.5">
      {values.map((v) => {
        const active = current === v.value;
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => setValue(v.value)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
