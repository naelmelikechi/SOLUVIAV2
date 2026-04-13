import {
  getDashboardData,
  getDashboardFinancials,
} from '@/lib/queries/dashboard';
import { PageHeader } from '@/components/shared/page-header';
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';

export default async function DashboardPage() {
  const [data, financials] = await Promise.all([
    getDashboardData(),
    getDashboardFinancials(),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="KPIs et alertes opérationnelles"
      />
      <DashboardPageClient data={data} financials={financials} />
    </div>
  );
}
