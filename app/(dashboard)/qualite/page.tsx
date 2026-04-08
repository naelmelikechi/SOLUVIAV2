import { getQualiteSummaries } from '@/lib/queries/qualite';
import { PageHeader } from '@/components/shared/page-header';
import { QualiteDataTable } from '@/components/qualite/qualite-data-table';

export default async function QualitePage() {
  const data = await getQualiteSummaries();

  return (
    <div>
      <PageHeader
        title="Qualité"
        description="Suivi Qualiopi par projet — 10 familles, 109 livrables"
      />
      <QualiteDataTable data={data} />
    </div>
  );
}
