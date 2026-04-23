import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PeriodToggle } from '@/components/indicateurs/period-toggle';
import { getTechCounters, type TechPeriod } from '@/lib/queries/indicateurs';

interface TechSectionProps {
  period: TechPeriod;
}

interface TechCardProps {
  title: string;
  value: number;
  subtitle: string;
}

function TechCard({ title, value, subtitle }: TechCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-3xl font-semibold tabular-nums">
            {value}
          </span>
          {value > 0 && (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
            />
          )}
        </div>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export async function TechSection({ period }: TechSectionProps) {
  const counters = await getTechCounters(period);
  const subtitle = period === 'cycle' ? 'sur le cycle en cours' : 'ce mois';

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Tech</h2>
          <p className="text-muted-foreground text-sm">
            Idées proposées et livrées par l&apos;équipe produit
          </p>
        </div>
        <PeriodToggle
          paramName="t"
          defaultValue="cycle"
          values={[
            { value: 'cycle', label: 'Cycle' },
            { value: 'month', label: 'Mensuel' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TechCard
          title="Idées proposées"
          value={counters.ideesProposees}
          subtitle={subtitle}
        />
        <TechCard
          title="Idées implémentées"
          value={counters.ideesImplementees}
          subtitle={subtitle}
        />
      </div>
    </section>
  );
}
