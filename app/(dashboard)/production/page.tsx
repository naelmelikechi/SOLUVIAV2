import { getProductionData } from '@/lib/queries/dashboard';
import { ProductionPageClient } from '@/components/production/production-page-client';

export default async function ProductionPage() {
  const data = await getProductionData();

  return <ProductionPageClient data={data} />;
}
