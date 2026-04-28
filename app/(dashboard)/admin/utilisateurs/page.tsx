import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUsersList, getCurrentUser } from '@/lib/queries/users';
import { getEmployeeCostDefaults } from '@/lib/queries/employee-cost';
import { isAdmin } from '@/lib/utils/roles';
import { UsersDataTable } from '@/components/admin/users-data-table';

export const metadata: Metadata = { title: 'Utilisateurs - SOLUVIA' };

export default async function UtilisateursPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  const [users, costDefaults] = await Promise.all([
    getUsersList(),
    getEmployeeCostDefaults(),
  ]);

  return (
    <UsersDataTable
      data={users}
      callerRole={user?.role}
      costDefaults={costDefaults}
    />
  );
}
