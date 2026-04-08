'use client';

import { useRouter } from 'next/navigation';
import type { ClientListItem } from '@/lib/queries/clients';
import { DataTable } from '@/components/shared/data-table';
import { clientListColumns } from '@/components/admin/client-list-columns';

export function ClientsDataTable({ data }: { data: ClientListItem[] }) {
  const router = useRouter();

  const handleRowClick = (row: ClientListItem) => {
    router.push(`/admin/clients/${row.id}`);
  };

  return (
    <DataTable
      columns={clientListColumns}
      data={data}
      searchKey="raison_sociale"
      searchPlaceholder="Rechercher un client..."
      onRowClick={handleRowClick}
    />
  );
}
