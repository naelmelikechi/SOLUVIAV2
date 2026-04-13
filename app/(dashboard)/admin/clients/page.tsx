import { getClientsList } from '@/lib/queries/clients';
import { PageHeader } from '@/components/shared/page-header';
import { ClientsDataTable } from '@/components/admin/clients-data-table';
import { ClientCreateButton } from '@/components/admin/client-create-button';

export default async function ClientsPage() {
  const clients = await getClientsList();

  return (
    <div>
      <PageHeader title="Clients" description="Liste des clients">
        <ClientCreateButton />
      </PageHeader>
      <ClientsDataTable data={clients} />
    </div>
  );
}
