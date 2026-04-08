import { getUsersList } from '@/lib/queries/users';
import { UsersDataTable } from '@/components/admin/users-data-table';

export default async function UtilisateursPage() {
  const users = await getUsersList();

  return <UsersDataTable data={users} />;
}
