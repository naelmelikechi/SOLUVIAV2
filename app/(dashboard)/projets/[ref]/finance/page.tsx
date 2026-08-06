import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getProjetFinance,
  getProjetTempsStats,
} from '@/lib/queries/projets';
import { listEcheancierTemplates } from '@/lib/queries/echeanciers';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetEcheancierManualPlaceholder } from '@/components/projets/projet-echeancier-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Finance - ${ref} - SOLUVIA` };
}

export default async function ProjetFinancePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  // getUser() est memoise (cache()) et deja resolu par le layout dashboard.
  const [projet, user] = await Promise.all([getProjetByRef(ref), getUser()]);
  if (!projet) notFound();

  const [finance, temps, echeancierTemplates] = await Promise.all([
    getProjetFinance(projet.id),
    getProjetTempsStats(projet.id),
    listEcheancierTemplates(),
  ]);

  const userIsAdmin = isAdmin(user?.role ?? null);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjetFinanceSection
          finance={finance}
          projetId={projet.id}
          canEdit={userIsAdmin}
          modeleFacturation={
            projet.modele_facturation === 'engagement'
              ? 'engagement'
              : 'echeancier'
          }
          echeancierTemplateId={projet.echeancier_template_id}
          echeancierTemplates={echeancierTemplates.map((t) => ({
            id: t.id,
            nom: t.nom,
            is_default: t.is_default,
          }))}
        />
        <ProjetTempsSection temps={temps} />
      </div>
      <ProjetEcheancierManualPlaceholder />
    </div>
  );
}
