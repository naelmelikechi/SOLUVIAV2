import type { Metadata } from 'next';
import { getFacturesList, getEcheancesPending } from '@/lib/queries/factures';
import { listAjustementsPending } from '@/lib/queries/ajustements';
import { PageHeader } from '@/components/shared/page-header';
import { FacturationPageClient } from '@/components/facturation/facturation-page-client';

export const metadata: Metadata = { title: 'Facturation - SOLUVIA' };
export const revalidate = 30;

export default async function FacturationPage() {
  const [factures, echeances, ajustements] = await Promise.all([
    getFacturesList(),
    getEcheancesPending(),
    listAjustementsPending(),
  ]);

  return (
    <div>
      <PageHeader title="Facturation" />
      <FacturationPageClient
        factures={factures}
        echeances={echeances}
        ajustements={ajustements}
      />
    </div>
  );
}
