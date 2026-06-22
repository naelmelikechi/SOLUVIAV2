import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listDevis } from '@/lib/queries/devis';
import { listSocietesEmettricesActives } from '@/lib/queries/societes-emettrices';
import { getClientsList } from '@/lib/queries/clients';
import { DevisPageClient } from '@/components/devis/devis-page-client';
import { NewDevisDialog } from '@/components/devis/new-devis-dialog';

export const metadata: Metadata = { title: 'Devis - SOLUVIA' };

export default async function DevisPage() {
  const [user, devis, societes, clients] = await Promise.all([
    getUser(),
    listDevis(),
    listSocietesEmettricesActives(),
    getClientsList(),
  ]);
  if (!isAdmin(user?.role)) redirect('/accueil');

  return (
    <div className="space-y-4 p-6">
      <PageHeader title="Devis" description="Devis émis vers les clients">
        <NewDevisDialog
          societes={societes.map((s) => ({
            id: s.id,
            code: s.code,
            raison_sociale: s.raison_sociale,
            est_defaut: s.est_defaut,
          }))}
          clients={clients.map((c) => ({
            id: c.id,
            trigramme: c.trigramme,
            raison_sociale: c.raison_sociale,
          }))}
        />
      </PageHeader>
      <DevisPageClient devis={devis} />
    </div>
  );
}
