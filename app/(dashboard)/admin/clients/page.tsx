'use client';

import { useRouter } from 'next/navigation';
import { MOCK_CLIENTS } from '@/lib/mock-data';
import { DataTable } from '@/components/shared/data-table';
import {
  clientListColumns,
  buildClientListData,
  type ClientListRow,
} from '@/components/admin/client-list-columns';
import { PageHeader } from '@/components/shared/page-header';

export default function ClientsPage() {
  const router = useRouter();
  const data = buildClientListData(MOCK_CLIENTS);

  const handleRowClick = (row: ClientListRow) => {
    router.push(`/admin/clients/${row.id}`);
  };

  return (
    <div>
      <PageHeader title="Clients" description="Liste des clients" />
      <DataTable
        columns={clientListColumns}
        data={data}
        searchKey="raison_sociale"
        searchPlaceholder="Rechercher un client..."
        onRowClick={handleRowClick}
      />
    </div>
  );
}
