'use client';

import { useState } from 'react';
import {
  GraduationCap,
  Trophy,
  Wallet,
  UserX,
  TrendingUp,
  Info,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type {
  ProjetPerformance,
  VoletPerformance,
} from '@/lib/queries/projet-performance';

const VOLETS: Array<{
  key: keyof ProjetPerformance;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'pedagogie', title: 'Pédagogie', icon: GraduationCap },
  { key: 'reussite', title: 'Réussite', icon: Trophy },
  { key: 'financement', title: 'Financement', icon: Wallet },
  { key: 'abandons', title: 'Abandons', icon: UserX },
  { key: 'rentabilite', title: 'Rentabilité', icon: TrendingUp },
];

const STATUS_BG: Record<VoletPerformance['status'], string> = {
  good: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  bad: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
};

export function ProjetPerformanceVolets({ data }: { data: ProjetPerformance }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {VOLETS.map(({ key, title, icon: Icon }) => {
        const volet = data[key];
        return <VoletCard key={key} title={title} icon={Icon} volet={volet} />;
      })}
    </div>
  );
}

function VoletCard({
  title,
  icon: Icon,
  volet,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  volet: VoletPerformance;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${STATUS_BG[volet.status]}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
            aria-label={`Détail formule ${title}`}
          >
            <Info className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-2 p-3 text-xs">
            <p className="font-semibold">Formule</p>
            <p className="text-muted-foreground">{volet.formula}</p>
            <div className="bg-border h-px" />
            <p className="font-semibold">Détail</p>
            <p className="text-muted-foreground">{volet.detail}</p>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{volet.display}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {volet.invertScale
            ? 'À minimiser'
            : volet.status === 'neutral'
              ? 'Données insuffisantes'
              : '0 — 100 % · à maximiser'}
        </p>
      </div>
    </Card>
  );
}
