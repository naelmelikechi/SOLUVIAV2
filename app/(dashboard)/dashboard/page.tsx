import type { Metadata } from 'next';
import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
  getMonthlyTrend,
  getInvoiceStatusBreakdown,
  getUserWeekHours,
} from '@/lib/queries/dashboard';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { Sparkline } from '@/components/shared/sparkline';
import { QualitePedagogieSection } from '@/components/dashboard/qualite-pedagogie-section';
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

  const user = await getCurrentUser();
  if (!user) return null;

  const scope: 'global' | 'cdp' = isAdmin(user.role) ? 'global' : 'cdp';
  const scopeId: string | null = isAdmin(user.role) ? null : user.id;

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
  // Seuls les type_kpi reels (ecrits par le CRON) sont utilises.
  const sparklines = {
    projetsActifs: (
      <Sparkline
        kpiType="projets_actifs"
        scope={scope}
        scopeId={scopeId}
        color="blue"
      />
    ),
    contratsActifs: (
      <Sparkline
        kpiType="contrats_actifs"
        scope={scope}
        scopeId={scopeId}
        color="blue"
      />
    ),
    facturesEmises: (
      <Sparkline
        kpiType="factures_emises"
        scope={scope}
        scopeId={scopeId}
        color="blue"
      />
    ),
    facturesEnRetard: (
      <Sparkline
        kpiType="factures_en_retard"
        scope={scope}
        scopeId={scopeId}
        color="red"
      />
    ),
    totalEncaisse: (
      <Sparkline
        kpiType="total_encaisse"
        scope={scope}
        scopeId={scopeId}
        color="green"
      />
    ),
  };

  return (
    <div className="space-y-8">
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
      <QualitePedagogieSection scope={scope} scopeId={scopeId} />
    </div>
  );
}
