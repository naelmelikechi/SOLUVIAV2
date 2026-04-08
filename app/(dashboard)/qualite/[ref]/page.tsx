'use client';

import { useParams, redirect } from 'next/navigation';
import { useState } from 'react';
import {
  getProjetByRef,
  getTachesByProjetId,
  FAMILLES_QUALITE,
} from '@/lib/mock-data';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectRef } from '@/components/shared/project-ref';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CheckCircle, Circle, ChevronDown, ChevronRight } from 'lucide-react';

export default function QualiteDetailPage() {
  const params = useParams<{ ref: string }>();
  const projet = getProjetByRef(params.ref);

  if (!projet) {
    redirect('/qualite');
  }

  const taches = getTachesByProjetId(projet.id);
  const totalDone = taches.filter((t) => t.fait).length;
  const totalPct =
    taches.length > 0 ? Math.round((totalDone / taches.length) * 100) : 0;

  return (
    <div>
      <PageHeader title="Qualité">
        <ProjectRef ref_={projet.ref} />
      </PageHeader>

      <div className="mb-6 flex items-center gap-6">
        <div className="text-sm">
          <span className="text-muted-foreground">Completion globale : </span>
          <span className="text-lg font-bold">{totalPct}%</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Livrables : </span>
          <span className="text-primary font-semibold">{totalDone}</span>
          <span className="text-muted-foreground"> / {taches.length}</span>
        </div>
        <StatusBadge label="Eduvia" color="orange" />
      </div>

      <div className="space-y-3">
        {FAMILLES_QUALITE.map((famille) => {
          const familleTaches = taches.filter(
            (t) => t.famille_code === famille.code,
          );
          const done = familleTaches.filter((t) => t.fait).length;
          const pct =
            familleTaches.length > 0
              ? Math.round((done / familleTaches.length) * 100)
              : 0;

          return (
            <FamilleCard
              key={famille.code}
              code={famille.code}
              libelle={famille.libelle}
              done={done}
              total={familleTaches.length}
              pct={pct}
              livrables={familleTaches.map((t) => ({
                id: t.id,
                label: t.livrable,
                fait: t.fait,
              }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function FamilleCard({
  code,
  libelle,
  done,
  total,
  pct,
  livrables,
}: {
  code: string;
  libelle: string;
  done: number;
  total: number;
  pct: number;
  livrables: { id: string; label: string; fait: boolean }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const color =
    pct >= 80
      ? 'bg-primary'
      : pct >= 50
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--destructive)]';

  return (
    <Card className="overflow-hidden">
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
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
