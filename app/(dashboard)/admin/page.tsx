import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';

export default async function AdminIndexPage() {
  const user = await getCurrentUser();
  redirect(isAdmin(user?.role) ? '/admin/clients' : '/projets');
}
