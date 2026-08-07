import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { checkAuth } from '@/lib/auth/guards';
import { listReglesArchivage } from '@/lib/queries/contrats-regles';
import { ReglesArchivageTable } from '@/components/admin/regles-archivage-table';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export const metadata: Metadata = {
  title: 'Archivage des contrats - SOLUVIA',
};

export default async function ArchivageContratsPage() {
  const auth = await checkAuth();
  if (!auth.ok) redirect('/accueil');

  const regles = await listReglesArchivage();

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: 'Paramètres', href: '/admin/parametres' },
            { label: 'Archivage des contrats' },
          ]}
        />
        <h1 className="text-2xl font-bold">
          Archivage automatique des contrats
        </h1>
        <p className="text-muted-foreground mt-1">
          Un cron quotidien sort de la production les contrats restés trop
          longtemps dans un état sans issue, selon ces règles. Un contrat
          portant une facture émise n&apos;est jamais archivé automatiquement.
        </p>
      </div>
      <ReglesArchivageTable regles={regles} />
    </div>
  );
}
