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
import {
  resolvePeriode,
  type PeriodeKey,
} from '@/lib/utils/dashboard-periode';
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
      />
    </div>
  );
}
