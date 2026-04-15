import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUsersList, getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { UsersDataTable } from '@/components/admin/users-data-table';

export const metadata: Metadata = { title: 'Utilisateurs - SOLUVIA' };

export default async function UtilisateursPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  const users = await getUsersList();

  return <UsersDataTable data={users} />;
}
