import type { Metadata } from 'next';
import { getProjetsListEnriched } from '@/lib/queries/projets';
import { getClientsList } from '@/lib/queries/clients';
import { getTypologies } from '@/lib/queries/parametres';
import { getUsersList, getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ProjetsDataTable } from '@/components/projets/projets-data-table';
import { ProjetCreateButton } from '@/components/projets/projet-create-button';

export const metadata: Metadata = { title: 'Projets — SOLUVIA' };
export const revalidate = 60;

export default async function ProjetsPage() {
  const [projets, clients, typologies, users, currentUser] = await Promise.all([
    getProjetsListEnriched(),
    getClientsList(),
    getTypologies(),
    getUsersList(),
    getCurrentUser(),
  ]);

  const adminUser = isAdmin(currentUser?.role);

  // Sort: actif first, then en_pause, termine, archive
  const order: Record<string, number> = {
    actif: 0,
    en_pause: 1,
    termine: 2,
    archive: 3,
  };
  const sorted = [...projets].sort(
    (a, b) => (order[a.statut] ?? 99) - (order[b.statut] ?? 99),
  );

  return (
    <div>
      <PageHeader
        title="Projets"
        description="Liste des projets actifs et archivés"
      >
        {adminUser && (
          <ProjetCreateButton
            clients={clients.map((c) => ({
              id: c.id,
              raison_sociale: c.raison_sociale,
            }))}
            typologies={typologies
              .filter((t) => t.actif)
              .map((t) => ({ id: t.id, code: t.code, libelle: t.libelle }))}
            users={users
              .filter((u) => u.actif)
              .map((u) => ({ id: u.id, nom: u.nom, prenom: u.prenom }))}
          />
        )}
      </PageHeader>
      <ProjetsDataTable data={sorted} userRole={currentUser?.role} />
    </div>
  );
}
