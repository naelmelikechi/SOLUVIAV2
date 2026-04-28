import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import {
  getIntercontratUsers,
  getTauxBillableTeam30j,
} from '@/lib/queries/intercontrat';
import { isAdmin } from '@/lib/utils/roles';
import { IntercontratList } from '@/components/admin/intercontrat-list';

export const metadata: Metadata = { title: 'Intercontrat - SOLUVIA' };
export const revalidate = 0;

export default async function IntercontratPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  const [users, tauxBillable] = await Promise.all([
    getIntercontratUsers(),
    getTauxBillableTeam30j(),
  ]);
  return <IntercontratList data={users} tauxBillable={tauxBillable} />;
}
