import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';

export default async function AdminIndexPage() {
  const user = await getUser();
  redirect(isAdmin(user?.role) ? '/admin/clients' : '/projets');
}
