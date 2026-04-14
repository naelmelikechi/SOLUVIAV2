import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClientsList } from '@/lib/queries/clients';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ClientsDataTable } from '@/components/admin/clients-data-table';
import { ClientCreateButton } from '@/components/admin/client-create-button';

export const metadata: Metadata = { title: 'Clients — SOLUVIA' };

export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

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
