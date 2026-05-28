import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { History } from 'lucide-react';
import {
  getParametresByCategorie,
  getTypologies,
  getAxesTemps,
  getJoursFeries,
  getLastEduviaSyncDate,
} from '@/lib/queries/parametres';
import { getEmployeeCostDefaults } from '@/lib/queries/employee-cost';
import { listEcheancierTemplates } from '@/lib/queries/echeanciers';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ParametresForm } from '@/components/admin/parametres-form';
import { EmployeeCostDefaultsForm } from '@/components/admin/employee-cost-defaults-form';
import { EcheanciersSectionWrapper } from '@/components/admin/echeanciers-section-wrapper';

export const metadata: Metadata = { title: 'Paramètres - SOLUVIA' };

export default async function ParametresPage() {
  // user + 8 queries en parallele. Si non-admin on paye pour rien (cas
  // rare : sidebar gate).
  const [
    user,
    entrepriseParams,
    facturationParams,
    typologies,
    axes,
    joursFeries,
    lastEduviaSyncDate,
    costDefaults,
    echeancierTemplates,
  ] = await Promise.all([
    getUser(),
    getParametresByCategorie('entreprise'),
    getParametresByCategorie('facturation'),
    getTypologies(),
    getAxesTemps(),
    getJoursFeries(2026),
    getLastEduviaSyncDate(),
    getEmployeeCostDefaults(),
    listEcheancierTemplates(),
  ]);
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

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
        description="Configuration du système - Admin uniquement"
      >
        <Link
          href="/admin/audit"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          <History className="size-3.5" />
          Historique
        </Link>
      </PageHeader>
      <div className="space-y-4">
        <ParametresForm
          entreprise={entreprise}
          facturation={facturation}
          typologies={typologies}
          axes={axes}
          joursFeries={joursFeries}
          lastEduviaSyncDate={lastEduviaSyncDate}
        />
        <EmployeeCostDefaultsForm initial={costDefaults} />
        <EcheanciersSectionWrapper templates={echeancierTemplates} />
        <Link
          href="/admin/parametres/societes-emettrices"
          className="hover:bg-muted/40 block rounded-md border p-4"
        >
          <h3 className="font-semibold">Societes emettrices</h3>
          <p className="text-muted-foreground text-sm">
            Gerer SOLUVIA, DIGIVIA et les autres entites juridiques.
          </p>
        </Link>
      </div>
    </div>
  );
}
