'use client';

import { useState } from 'react';
import {
  GraduationCap,
  Trophy,
  Wallet,
  Users,
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

const STATUS_TEXT: Record<VoletPerformance['status'], string> = {
  good: 'text-green-600 dark:text-green-400',
  warn: 'text-amber-600 dark:text-amber-500',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
};

// Bande de KPI compacte : apprentis actifs + les 5 volets de performance sur
// une seule rangee de tuiles (hairlines via gap-px sur fond border).
export function ProjetPerformanceVolets({
  data,
  apprentisActifs,
}: {
  data: ProjetPerformance;
  apprentisActifs: number;
}) {
  return (
    <Card className="bg-border grid grid-cols-2 gap-px p-0 sm:grid-cols-3 lg:grid-cols-6">
      <div className="bg-card flex flex-col gap-1 p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
          <Users className="size-3.5 shrink-0 text-[var(--info)]" />
          <span className="truncate">Apprentis actifs</span>
        </div>
        <p className="text-xl font-bold text-[var(--info)] tabular-nums">
          {apprentisActifs}
        </p>
      </div>
      {VOLETS.map(({ key, title, icon: Icon }) => (
        <VoletTile key={key} title={title} icon={Icon} volet={data[key]} />
      ))}
    </Card>
  );
}

function VoletTile({
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
    <div className="bg-card flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-1">
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
          <Icon className={`size-3.5 shrink-0 ${STATUS_TEXT[volet.status]}`} />
          <span className="truncate">{title}</span>
        </div>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-0.5 transition-colors"
            aria-label={`Détail formule ${title}`}
          >
            <Info className="size-3" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-2 p-3 text-xs">
            <p className="font-semibold">Formule</p>
            <p className="text-muted-foreground">{volet.formula}</p>
            <div className="bg-border h-px" />
            <p className="font-semibold">Détail</p>
            <p className="text-muted-foreground">{volet.detail}</p>
            <p className="text-muted-foreground">
              {volet.invertScale ? 'À minimiser.' : 'À maximiser.'}
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <p
        className={`text-xl font-bold tabular-nums ${STATUS_TEXT[volet.status]}`}
      >
        {volet.display}
      </p>
    </div>
  );
}
