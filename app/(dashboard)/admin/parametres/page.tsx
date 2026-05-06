import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { History, CalendarClock } from 'lucide-react';
import {
  getParametresByCategorie,
  getTypologies,
  getAxesTemps,
  getJoursFeries,
  getLastEduviaSyncDate,
} from '@/lib/queries/parametres';
import { getEmployeeCostDefaults } from '@/lib/queries/employee-cost';
import { listEcheancierTemplates } from '@/lib/queries/echeanciers';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ParametresForm } from '@/components/admin/parametres-form';
import { EmployeeCostDefaultsForm } from '@/components/admin/employee-cost-defaults-form';
import { EcheanciersTemplatesSection } from '@/components/admin/echeanciers-templates-section';
import { SectionCard } from '@/components/admin/section-card';

export const metadata: Metadata = { title: 'Paramètres - SOLUVIA' };

export default async function ParametresPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) {
    redirect('/projets');
  }

  const [
    entrepriseParams,
    facturationParams,
    typologies,
    axes,
    joursFeries,
    lastEduviaSyncDate,
    costDefaults,
    echeancierTemplates,
  ] = await Promise.all([
    getParametresByCategorie('entreprise'),
    getParametresByCategorie('facturation'),
    getTypologies(),
    getAxesTemps(),
    getJoursFeries(2026),
    getLastEduviaSyncDate(),
    getEmployeeCostDefaults(),
    listEcheancierTemplates(),
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
        description="Configuration du système - Admin uniquement"
      >
        <Link
          href="/admin/audit"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors"
        >
          <History className="h-3.5 w-3.5" />
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
        <SectionCard
          icon={<CalendarClock className="h-4 w-4 shrink-0" />}
          title="Échéanciers de facturation"
        >
          <EcheanciersTemplatesSection templates={echeancierTemplates} />
        </SectionCard>
      </div>
    </div>
  );
}
