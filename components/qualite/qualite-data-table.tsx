'use client';

import { useRouter } from 'next/navigation';
import type { QualiteSummary } from '@/lib/queries/qualite';
import { DataTable } from '@/components/shared/data-table';
import { qualiteListColumns } from '@/components/qualite/qualite-list-columns';

export function QualiteDataTable({ data }: { data: QualiteSummary[] }) {
  const router = useRouter();

  const handleRowClick = (row: QualiteSummary) => {
    router.push(`/qualite/${row.projet.ref ?? ''}`);
  };

  return (
    <DataTable
      columns={qualiteListColumns}
      data={data}
      searchKey="ref"
      searchPlaceholder="Rechercher un projet..."
      onRowClick={handleRowClick}
    />
  );
}
