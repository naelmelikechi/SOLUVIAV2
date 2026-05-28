import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { SocieteEmettriceForm } from '@/components/admin/societe-emettrice-form';

export const metadata: Metadata = { title: 'Nouvelle societe - SOLUVIA' };

export default async function NouvelleSocietePage() {
  const user = await getUser();
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Nouvelle societe emettrice"
        description="Entite juridique qui emettra devis et factures"
      />
      <SocieteEmettriceForm />
    </div>
  );
}
