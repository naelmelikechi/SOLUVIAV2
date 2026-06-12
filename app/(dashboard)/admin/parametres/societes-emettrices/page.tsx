import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { PageHeader } from '@/components/shared/page-header';
import { SocietesEmettricesTable } from '@/components/admin/societes-emettrices-table';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listSocietesEmettrices } from '@/lib/queries/societes-emettrices';

export const metadata: Metadata = { title: 'Sociétés émettrices - SOLUVIA' };

export default async function SocietesEmettricesPage() {
  const [user, societes] = await Promise.all([
    getUser(),
    listSocietesEmettrices(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Sociétés émettrices"
        description="Entités juridiques qui émettent devis et factures"
      >
        <Link
          href="/admin/parametres/societes-emettrices/nouvelle"
          className={buttonVariants()}
        >
          <Plus className="size-4" />
          Nouvelle société
        </Link>
      </PageHeader>

      <SocietesEmettricesTable societes={societes} />
    </div>
  );
}
