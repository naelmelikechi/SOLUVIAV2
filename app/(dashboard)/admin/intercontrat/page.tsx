import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import {
  getIntercontratUsers,
  getTauxBillableTeam30j,
} from '@/lib/queries/intercontrat';
import { isAdmin } from '@/lib/utils/roles';
import { IntercontratList } from '@/components/admin/intercontrat-list';

export const metadata: Metadata = { title: 'Intercontrat - SOLUVIA' };
export const revalidate = 0;

export default async function IntercontratPage() {
  // user + queries en parallele. Si l user n est pas admin on paye 2
  // queries pour rien (cas rare : sidebar gate).
  const [currentUser, users, tauxBillable] = await Promise.all([
    getUser(),
    getIntercontratUsers(),
    getTauxBillableTeam30j(),
  ]);
  if (!isAdmin(currentUser?.role)) {
    redirect('/projets');
  }

  return <IntercontratList data={users} tauxBillable={tauxBillable} />;
}
