import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getCommercialCounters,
  type IndicateursScope,
} from '@/lib/queries/indicateurs';

interface CommercialSectionProps {
  scope: IndicateursScope;
}

interface CounterCardProps {
  title: string;
  value: number;
  subtitle: string;
}

function CounterCard({ title, value, subtitle }: CounterCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-foreground text-3xl font-semibold tabular-nums">
          {value}
        </div>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export async function CommercialSection({ scope }: CommercialSectionProps) {
  const counters = await getCommercialCounters(scope);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Commercial</h2>
        <p className="text-muted-foreground text-sm">
          {scope.kind === 'admin'
            ? "Activité commerciale globale de l'équipe"
            : 'Votre activité commerciale'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CounterCard
          title="RDV réalisés"
          value={counters.rdvRealises}
          subtitle="cette semaine"
        />
        <CounterCard
          title="Contrats signés"
          value={counters.contratsSignes}
          subtitle="ce mois"
        />
        <CounterCard
          title="Apprenants apportés"
          value={counters.apprenantsApportes}
          subtitle="ce mois"
        />
        <CounterCard
          title="Volume alternants"
          value={counters.volumeAlternants}
          subtitle="portefeuille total"
        />
      </div>
    </section>
  );
}
