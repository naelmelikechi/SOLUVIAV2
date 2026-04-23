import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { getIndicateursData } from '@/lib/queries/indicateurs';
import { KpiEvolutionCard } from '@/components/indicateurs/kpi-evolution-card';
import { IndicateursTrendChart } from '@/components/indicateurs/indicateurs-trend-chart';

export const metadata: Metadata = { title: 'Indicateurs - SOLUVIA' };
export const revalidate = 60;

export default async function IndicateursPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const { data: currentUser } = authUser
    ? await supabase.from('users').select('role').eq('id', authUser.id).single()
    : { data: null };

  if (!isAdmin(currentUser?.role)) {
    notFound();
  }

  const { kpis, trend } = await getIndicateursData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicateurs"
        description="Évolution hebdomadaire des KPIs de l'équipe"
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

      <IndicateursTrendChart data={trend} />
    </div>
  );
}
