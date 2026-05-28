import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUsersList, getUser } from '@/lib/queries/users';
import { getEmployeeCostDefaults } from '@/lib/queries/employee-cost';
import { isAdmin } from '@/lib/utils/roles';
import { UsersDataTable } from '@/components/admin/users-data-table';

export const metadata: Metadata = { title: 'Utilisateurs - SOLUVIA' };

export default async function UtilisateursPage() {
  // user + queries en parallele. Si non-admin on paye 2 queries pour
  // rien (cas rare : sidebar gate).
  const [user, users, costDefaults] = await Promise.all([
    getUser(),
    getUsersList(),
    getEmployeeCostDefaults(),
  ]);
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  return (
    <UsersDataTable
      data={users}
      callerRole={user?.role}
      costDefaults={costDefaults}
    />
  );
}
