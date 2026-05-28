'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type {
  PeriodeInternes,
  ScopeInternes,
} from '@/lib/queries/projets-internes';

const PERIODES: { value: PeriodeInternes; label: string }[] = [
  { value: 'mois', label: 'Mois' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'annee', label: 'Année' },
  { value: '12mois', label: '12 mois' },
];

interface Props {
  periode: PeriodeInternes;
  scope: ScopeInternes;
  showScope: boolean;
}

export function PeriodScopeControls(props: Props) {
  return (
    <Suspense fallback={null}>
      <PeriodScopeControlsInner {...props} />
    </Suspense>
  );
}

function PeriodScopeControlsInner({ periode, scope, showScope }: Props) {
  const { replace } = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set(key, value);
      replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, replace],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="border-border bg-muted/30 inline-flex items-center rounded-md border p-0.5">
        {PERIODES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => updateParam('periode', p.value)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              periode === p.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showScope && (
        <div className="border-border bg-muted/30 inline-flex items-center rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => updateParam('scope', 'moi')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              scope === 'moi'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Moi
          </button>
          <button
            type="button"
            onClick={() => updateParam('scope', 'equipe')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              scope === 'equipe'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Toute l&apos;équipe
          </button>
        </div>
      )}
    </div>
  );
}
