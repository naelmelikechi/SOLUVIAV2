import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getClientsList } from '@/lib/queries/clients';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ClientsDataTable } from '@/components/admin/clients-data-table';
import { ClientCreateButton } from '@/components/admin/client-create-button';

export const metadata: Metadata = { title: 'Clients - SOLUVIA' };
export const revalidate = 120;

export default async function ClientsPage() {
  // user + clients en parallele. Si non-admin on paye getClientsList pour
  // rien (cas rare : sidebar gate).
  const [user, clients] = await Promise.all([
    getCurrentUser(),
    getClientsList(),
  ]);
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  return (
    <div>
      <PageHeader title="Clients" description="Liste des clients">
        <ClientCreateButton />
      </PageHeader>
      <ClientsDataTable data={clients} />
    </div>
  );
}
