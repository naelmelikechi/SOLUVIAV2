import type { Metadata } from 'next';
import { getContratsAFacturer } from '@/lib/queries/contrats-a-facturer';
import { PageHeader } from '@/components/shared/page-header';
import { AFacturerTable } from '@/components/a-facturer/a-facturer-table';

export const metadata: Metadata = { title: 'À facturer - SOLUVIA' };
export const revalidate = 30;

export default async function AFacturerPage() {
  const rows = await getContratsAFacturer();

  return (
    <div>
      <PageHeader
        title="À facturer"
        description="Contrats dont une échéance OPCO est due et non encore transmise"
      />
      <AFacturerTable data={rows} />
    </div>
  );
}
