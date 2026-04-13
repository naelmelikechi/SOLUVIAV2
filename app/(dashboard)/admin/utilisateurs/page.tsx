import { redirect } from 'next/navigation';
import { getUsersList, getCurrentUser } from '@/lib/queries/users';
import { UsersDataTable } from '@/components/admin/users-data-table';

export default async function UtilisateursPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    redirect('/projets');
  }

  const users = await getUsersList();

  return <UsersDataTable data={users} />;
}
