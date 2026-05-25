import type { Metadata } from 'next';
import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
  getMonthlyTrend,
  getInvoiceStatusBreakdown,
  getUserWeekHours,
} from '@/lib/queries/dashboard';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Sparkline } from '@/components/shared/sparkline';
import { resolvePeriode, type PeriodeKey } from '@/lib/utils/dashboard-periode';
import { format, startOfMonth, addMonths } from 'date-fns';

export const metadata: Metadata = { title: 'Tableau de bord - SOLUVIA' };
export const revalidate = 30;

const VALID_PERIODES: PeriodeKey[] = ['ce_mois', 'mois_precedent', '30j'];

function isPeriodeKey(v: string): v is PeriodeKey {
  return (VALID_PERIODES as readonly string[]).includes(v);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const params = await searchParams;
  const periodeKey: PeriodeKey =
    params.periode && isPeriodeKey(params.periode) ? params.periode : 'ce_mois';

  const now = new Date();
  const periode = resolvePeriode(periodeKey, now);
  const previousMonth = format(startOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');

  const [
    data,
    financials,
    previousKpis,
    monthlyTrend,
    invoiceBreakdown,
    weekHours,
  ] = await Promise.all([
    getDashboardData(),
    getDashboardFinancials(periode),
    getKpiSnapshots(previousMonth),
    getMonthlyTrend(),
    getInvoiceStatusBreakdown(),
    getUserWeekHours(),
  ]);

  // Sparklines sont des Server Components async : on les instancie ici (Server Component)
  // et on les passe comme ReactNode au client via la prop sparklines.
  const sparklines = {
    projetsActifs: (
      <Sparkline kpiType="projets_actifs" scope="global" color="blue" />
    ),
    contratsActifs: (
      <Sparkline kpiType="contrats_actifs" scope="global" color="blue" />
    ),
    nbApprenantsActifs: (
      <Sparkline kpiType="nb_apprenants_actifs" scope="global" color="blue" />
    ),
    nbFormationsEnCours: (
      <Sparkline kpiType="nb_formations_en_cours" scope="global" color="blue" />
    ),
    tauxSaisieTemps: (
      <Sparkline kpiType="taux_saisie_temps" scope="global" color="blue" />
    ),
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="KPIs et alertes opérationnelles"
      >
        <PeriodSelector current={periodeKey} label={periode.label} />
      </PageHeader>
      <DashboardPageClient
        data={data}
        financials={financials}
        previousKpis={previousKpis}
        monthlyTrend={monthlyTrend}
        invoiceBreakdown={invoiceBreakdown}
        weekHours={weekHours}
        periode={periode}
        sparklines={sparklines}
      />
    </div>
  );
}
