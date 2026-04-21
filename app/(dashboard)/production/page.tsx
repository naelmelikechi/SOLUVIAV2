import type { Metadata } from 'next';
import { getProductionPageData } from '@/lib/queries/production';
import { ProductionPageClient } from '@/components/production/production-page-client';

export const metadata: Metadata = { title: 'Production - SOLUVIA' };
export const revalidate = 60;

interface ProductionPageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function ProductionPage({
  searchParams,
}: ProductionPageProps) {
  const params = await searchParams;
  const requested = Number.parseInt(params.year ?? '', 10);
  const year = Number.isFinite(requested)
    ? requested
    : new Date().getFullYear();

  const data = await getProductionPageData(year);

  return <ProductionPageClient data={data} />;
}
