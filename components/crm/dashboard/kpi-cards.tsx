import Link from 'next/link';
import {
  GraduationCap,
  KanbanSquare,
  TrendingUp,
  BellRing,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/crm/ui/card';
import { cn } from '@/lib/crm/utils';

type Kpi = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tint: string;
  href?: string;
  alert?: boolean;
};

export function KpiCards({
  apprentis,
  ouvertes,
  conversion,
  relancesDues,
}: {
  apprentis: number;
  ouvertes: number;
  conversion: number;
  relancesDues: number;
}) {
  const items: Kpi[] = [
    {
      label: 'Apprentis en pipeline',
      value: apprentis,
      icon: GraduationCap,
      tint: 'bg-primary/10 text-primary',
      href: '/crm/pipeline',
    },
    {
      label: 'Opportunités ouvertes',
      value: ouvertes,
      icon: KanbanSquare,
      tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
      href: '/crm/pipeline',
    },
    {
      label: 'Taux de conversion',
      value: `${conversion} %`,
      icon: TrendingUp,
      tint: 'bg-success/10 text-success',
    },
    {
      label: 'Relances à traiter',
      value: relancesDues,
      icon: BellRing,
      tint:
        relancesDues > 0
          ? 'bg-warning/10 text-warning'
          : 'bg-muted text-muted-foreground',
      href: '/crm/relances',
      alert: relancesDues > 0,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it, i) => {
        const Icon = it.icon;
        const body = (
          <Card
            className={cn(
              'animate-in fade-in slide-in-from-bottom-2 h-full p-5 transition-all duration-300',
              it.href &&
                'hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-md',
              it.alert && 'ring-warning/20 ring-1',
            )}
            style={{
              animationDelay: `${i * 60}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground text-sm">{it.label}</span>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  it.tint,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {it.value}
            </div>
          </Card>
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className="block">
            {body}
          </Link>
        ) : (
          <div key={it.label}>{body}</div>
        );
      })}
    </div>
  );
}
