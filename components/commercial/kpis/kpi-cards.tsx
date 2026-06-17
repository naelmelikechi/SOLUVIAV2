'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommercialKpis } from '@/lib/queries/commercial-kpis';

function Trend({ value, previous }: { value: number; previous: number }) {
  const delta = value - previous;
  const Icon =
    delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight;
  const color =
    delta > 0
      ? 'text-emerald-600'
      : delta < 0
        ? 'text-red-600'
        : 'text-muted-foreground';
  const label =
    delta === 0
      ? 'stable vs préc.'
      : `${delta > 0 ? '+' : ''}${delta} vs préc.`;
  return (
    <div className={cn('mt-1 flex items-center gap-1 text-xs', color)}>
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function KpiTile({
  label,
  value,
  subtitle,
  children,
}: {
  label: string;
  value: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-border/60 bg-card rounded-lg border p-3">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      {subtitle && (
        <div className="text-muted-foreground mt-0.5 text-[11px]">
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

interface Props {
  volume: CommercialKpis['volume'];
  cycle: CommercialKpis['cycle'];
}

export function KpiCards({ volume, cycle }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <KpiTile
        label="Prospects actifs"
        value={String(volume.actifs)}
        subtitle="Hors perdus et archivés"
      />
      <KpiTile
        label="Qualifiés"
        value={String(volume.qualifies)}
        subtitle="Présenté ou au-delà"
      />
      <KpiTile label="Nouveaux" value={String(volume.nouveaux.value)}>
        <Trend
          value={volume.nouveaux.value}
          previous={volume.nouveaux.previous}
        />
      </KpiTile>
      <KpiTile label="Signatures" value={String(volume.signatures.value)}>
        <Trend
          value={volume.signatures.value}
          previous={volume.signatures.previous}
        />
      </KpiTile>
      <KpiTile
        label="Cycle médian"
        value={`${cycle.medianJours} j`}
        subtitle={`Moyen ${cycle.moyenJours} j · ${cycle.count} signature${
          cycle.count > 1 ? 's' : ''
        }`}
      />
    </div>
  );
}
