'use client';

import { useRouter } from 'next/navigation';
import {
  getQualiteSummaries,
  type QualiteProjetSummary,
} from '@/lib/mock-data';
import { DataTable } from '@/components/shared/data-table';
import { qualiteListColumns } from '@/components/qualite/qualite-list-columns';
import { PageHeader } from '@/components/shared/page-header';

export default function QualitePage() {
  const router = useRouter();
  const data = getQualiteSummaries();

  const handleRowClick = (row: QualiteProjetSummary) => {
    router.push(`/qualite/${row.projet.ref}`);
  };

  return (
    <div>
      <PageHeader
        title="Qualité"
        description="Suivi Qualiopi par projet — 10 familles, 109 livrables"
      />
      <DataTable
        columns={qualiteListColumns}
        data={data}
        searchKey="ref"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
      />
    </div>
  );
}
