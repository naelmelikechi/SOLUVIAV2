import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getSocieteEmettriceById } from '@/lib/queries/societes-emettrices';
import { SocieteEmettriceForm } from '@/components/admin/societe-emettrice-form';

export const metadata: Metadata = { title: 'Societe emettrice - SOLUVIA' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSocietePage({ params }: PageProps) {
  const { id } = await params;
  const [user, societe] = await Promise.all([
    getCurrentUser(),
    getSocieteEmettriceById(id),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');
  if (!societe) notFound();

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={`${societe.raison_sociale} (${societe.code})`}
        description="Modification des informations societe emettrice"
      />
      <SocieteEmettriceForm societe={societe} />
    </div>
  );
}
