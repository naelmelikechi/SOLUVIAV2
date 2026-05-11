import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getBugReports } from '@/lib/queries/bug-reports';
import { PageHeader } from '@/components/shared/page-header';
import { BugsTable } from './bugs-table';

export const metadata: Metadata = { title: 'Bugs - SOLUVIA' };

export default async function AdminBugsPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) redirect('/projets');

  const reports = await getBugReports();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bugs signalés"
        description="Rapports envoyés par les utilisateurs avec analyse IA."
      />
      <BugsTable reports={reports} />
    </div>
  );
}
