import type { Metadata } from 'next';
import { getProductionData } from '@/lib/queries/production';
import { ProductionPageClient } from '@/components/production/production-page-client';

export const metadata: Metadata = { title: 'Production - SOLUVIA' };
export const revalidate = 60;

export default async function ProductionPage() {
  const data = await getProductionData();
  return <ProductionPageClient data={data} />;
}
