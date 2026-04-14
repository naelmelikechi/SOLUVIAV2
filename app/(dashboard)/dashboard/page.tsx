import type { Metadata } from 'next';
import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
  getMonthlyTrend,
  getInvoiceStatusBreakdown,
} from '@/lib/queries/dashboard';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { format, startOfMonth, addMonths } from 'date-fns';

export const metadata: Metadata = { title: 'Tableau de bord — SOLUVIA' };
export const revalidate = 30;

export default async function DashboardPage() {
  const now = new Date();
  const previousMonth = format(startOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');

  const [data, financials, previousKpis, monthlyTrend, invoiceBreakdown] =
    await Promise.all([
      getDashboardData(),
      getDashboardFinancials(),
      getKpiSnapshots(previousMonth),
      getMonthlyTrend(),
      getInvoiceStatusBreakdown(),
    ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="KPIs et alertes opérationnelles"
      />
      <DashboardPageClient
        data={data}
        financials={financials}
        previousKpis={previousKpis}
        monthlyTrend={monthlyTrend}
        invoiceBreakdown={invoiceBreakdown}
      />
    </div>
  );
}
