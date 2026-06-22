import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { getCommerciaux } from '@/lib/queries/prospects';
import {
  getCommercialKpis,
  type PeriodeKpi,
  type TunnelKpi,
} from '@/lib/queries/commercial-kpis';
import { PageHeader } from '@/components/shared/page-header';
import { KpiDashboard } from '@/components/commercial/kpis/kpi-dashboard';

export const metadata: Metadata = {
  title: 'Tableau de bord commercial - SOLUVIA',
};

const PERIODES: PeriodeKpi[] = ['mois', 'mois_precedent', 'trimestre', 'annee'];

export default async function CommercialKpisPage({
  searchParams,
}: {
  searchParams: Promise<{
    periode?: string;
    tunnel?: string;
    commercial?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();

  if (!canAccessPipeline(currentUser?.role, currentUser?.pipeline_access)) {
    redirect('/accueil');
  }

  const admin = isAdmin(currentUser?.role);
  const sp = await searchParams;

  const periode: PeriodeKpi = PERIODES.includes(sp.periode as PeriodeKpi)
    ? (sp.periode as PeriodeKpi)
    : 'mois';
  const tunnel: TunnelKpi | undefined =
    sp.tunnel === 'cfa' || sp.tunnel === 'entreprise' ? sp.tunnel : undefined;
  // Vue Direction (admin) : tout, filtre commercial libre.
  // Vue Développeur (pipeline non-admin) : forcée sur ses propres prospects.
  const commercialId = admin ? sp.commercial || undefined : user.id;

  const [kpis, commerciaux] = await Promise.all([
    getCommercialKpis({ periode, tunnel, commercialId }),
    admin ? getCommerciaux() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord commercial"
        description="Volume, conversion, cycle et alertes du pipeline commercial"
      />
      <KpiDashboard kpis={kpis} commerciaux={commerciaux} isAdmin={admin} />
    </div>
  );
}
