'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PeriodeKey } from '@/lib/utils/dashboard-periode';

const OPTIONS: { key: PeriodeKey; label: string }[] = [
  { key: 'ce_mois', label: 'Ce mois' },
  { key: 'mois_precedent', label: 'Mois précédent' },
  { key: '30j', label: '30 derniers jours' },
];

export function PeriodSelector(props: { current: PeriodeKey; label: string }) {
  return (
    <Suspense fallback={null}>
      <PeriodSelectorInner {...props} />
    </Suspense>
  );
}

function PeriodSelectorInner({
  current,
  label,
}: {
  current: PeriodeKey;
  label: string;
}) {
  const { push } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (key: PeriodeKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'ce_mois') params.delete('periode');
    else params.set('periode', key);
    const qs = params.toString();
    push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="bg-popover border-border absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border shadow-md">
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => select(opt.key)}
              className={cn(
                'hover:bg-accent w-full px-3 py-1.5 text-left text-xs',
                opt.key === current && 'bg-accent font-semibold',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
