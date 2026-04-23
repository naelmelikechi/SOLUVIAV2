import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import {
  getIndicateursData,
  getIndicateursScope,
  getKpiKeysForScope,
} from '@/lib/queries/indicateurs';
import { KpiEvolutionCard } from '@/components/indicateurs/kpi-evolution-card';
import { IndicateursTrendChart } from '@/components/indicateurs/indicateurs-trend-chart';

export const metadata: Metadata = { title: 'Indicateurs - SOLUVIA' };
export const revalidate = 60;

function getDescription(kind: 'admin' | 'cdp' | 'commercial'): string {
  switch (kind) {
    case 'admin':
      return "Évolution hebdomadaire des KPIs de l'équipe";
    case 'cdp':
      return 'Évolution hebdomadaire de vos projets';
    case 'commercial':
      return 'Évolution hebdomadaire de votre activité commerciale';
  }
}

export default async function IndicateursPage() {
  const scope = await getIndicateursScope();
  if (!scope) {
    notFound();
  }

  const { kpis, trend } = await getIndicateursData(scope);
  const allowedKeys = getKpiKeysForScope(scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicateurs"
        description={getDescription(scope.kind)}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiEvolutionCard
            key={kpi.key}
            label={kpi.label}
            current={kpi.current}
            previous={kpi.previous}
            format={kpi.format}
          />
        ))}
      </div>

      <IndicateursTrendChart data={trend} allowedKeys={allowedKeys} />
    </div>
  );
}
