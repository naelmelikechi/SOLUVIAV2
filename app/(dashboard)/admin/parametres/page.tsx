import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getParametresByCategorie,
  getTypologies,
  getAxesTemps,
  getJoursFeries,
  getLastEduviaSyncDate,
} from '@/lib/queries/parametres';
import { getCurrentUser } from '@/lib/queries/users';
import { PageHeader } from '@/components/shared/page-header';
import { ParametresForm } from '@/components/admin/parametres-form';

export const metadata: Metadata = { title: 'Paramètres — SOLUVIA' };

export default async function ParametresPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') {
    redirect('/projets');
  }

  const [
    entrepriseParams,
    facturationParams,
    typologies,
    axes,
    joursFeries,
    lastEduviaSyncDate,
  ] = await Promise.all([
    getParametresByCategorie('entreprise'),
    getParametresByCategorie('facturation'),
    getTypologies(),
    getAxesTemps(),
    getJoursFeries(2026),
    getLastEduviaSyncDate(),
  ]);

  // Convert params arrays to key-value maps
  const entreprise = Object.fromEntries(
    entrepriseParams.map((p) => [p.cle.replace('entreprise.', ''), p.valeur]),
  );
  const facturation = Object.fromEntries(
    facturationParams.map((p) => [p.cle.replace('facturation.', ''), p.valeur]),
  );

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Configuration du système — Admin uniquement"
      />
      <ParametresForm
        entreprise={entreprise}
        facturation={facturation}
        typologies={typologies}
        axes={axes}
        joursFeries={joursFeries}
        lastEduviaSyncDate={lastEduviaSyncDate}
      />
    </div>
  );
}
