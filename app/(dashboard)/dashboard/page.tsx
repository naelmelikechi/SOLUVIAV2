import {
  getDashboardData,
  getDashboardFinancials,
  getKpiSnapshots,
} from '@/lib/queries/dashboard';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';
import { format, startOfMonth, addMonths } from 'date-fns';

export default async function DashboardPage() {
  const now = new Date();
  const previousMonth = format(startOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');

  const [data, financials, previousKpis] = await Promise.all([
    getDashboardData(),
    getDashboardFinancials(),
    getKpiSnapshots(previousMonth),
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
      />
    </div>
  );
}
