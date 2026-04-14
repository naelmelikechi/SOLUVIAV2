'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface FamilleCardProps {
  code: string;
  libelle: string;
  done: number;
  total: number;
  pct: number;
  indicateurs: number;
  livrables: {
    id: string;
    label: string;
    fait: boolean;
    eduvia_url?: string | null;
  }[];
}

export function FamilleCard({
  code,
  libelle,
  done,
  total,
  pct,
  indicateurs,
  livrables,
}: FamilleCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isConforme = done === total && total > 0;

  const color =
    pct >= 80
      ? 'bg-primary'
      : pct >= 50
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--destructive)]';

  return (
    <Card
      className={`overflow-hidden border-l-4 ${isConforme ? 'border-l-green-500' : 'border-l-orange-500'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${code} ${libelle}`}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--card-alt)]"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          )}
          <span className="text-primary inline-block min-w-[40px] rounded bg-[var(--primary-bg)] px-2 py-0.5 text-center font-mono text-xs font-bold">
            {code}
          </span>
          <span className="text-sm font-medium">{libelle}</span>
          <span className="text-muted-foreground text-xs">
            {indicateurs} indicateur{indicateurs > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--border-light)]">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="min-w-[60px] text-right text-sm tabular-nums">
            <span className="font-medium">{done}</span>
            <span className="text-muted-foreground"> / {total}</span>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-border border-t px-4 py-3">
          <div className="space-y-1.5">
            {livrables.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                {l.fait ? (
                  <CheckCircle className="text-primary h-4 w-4" />
                ) : (
                  <Circle className="text-muted-foreground h-4 w-4" />
                )}
                <span className={l.fait ? '' : 'text-muted-foreground'}>
                  {l.label}
                </span>
                {l.eduvia_url && (
                  <a
                    href={l.eduvia_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary ml-2 inline-flex items-center"
                    title="Ouvrir dans Eduvia"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
