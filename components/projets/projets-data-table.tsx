'use client';

import { useRouter } from 'next/navigation';
import type { ProjetListItem } from '@/lib/queries/projets';
import { DataTable } from '@/components/shared/data-table';
import { projetListColumns } from '@/components/projets/projet-list-columns';

export function ProjetsDataTable({ data }: { data: ProjetListItem[] }) {
  const router = useRouter();

  const handleRowClick = (row: ProjetListItem) => {
    router.push(`/projets/${row.ref}`);
  };

  return (
    <DataTable
      columns={projetListColumns}
      data={data}
      searchKey="ref"
      searchPlaceholder="Rechercher un projet..."
      onRowClick={handleRowClick}
    />
  );
}
