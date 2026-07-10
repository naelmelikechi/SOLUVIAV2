import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  getProjetFinance,
  getProjetTempsStats,
  getDocumentsByProjetId,
} from '@/lib/queries/projets';
import { getRdvFormateursByProjetId } from '@/lib/queries/rdv';
import { listEcheancierTemplates } from '@/lib/queries/echeanciers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} - Projets - SOLUVIA` };
}
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { SectionNav } from '@/components/shared/section-nav';
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';
import { ProjetContratsTable } from '@/components/projets/projet-contrats-table';
import { ProjetStatCards } from '@/components/projets/projet-stat-cards';
import { ProjetDetailHeader } from '@/components/projets/projet-detail-header';
import { ProjetEcheancierManualPlaceholder } from '@/components/projets/projet-echeancier-section';
import { ProjetPerformanceVolets } from '@/components/projets/projet-performance-volets';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import { ProjetDuplicateButton } from '@/components/projets/projet-duplicate-button';
import { ProjetDocumentsSection } from '@/components/projets/projet-documents-section';
import { ProjetRdvSection } from '@/components/projets/projet-rdv-section';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { isContratActif } from '@/lib/utils/contrat-states';

export default async function ProjetDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const [{ ref }, supabase] = await Promise.all([params, createClient()]);
  // Projet + auth en parallele : independants. notFound n est verifie
  // qu apres pour ne pas perdre le round-trip auth si projet existe.
  const [projet, authUserRes] = await Promise.all([
    getProjetByRef(ref),
    supabase.auth.getUser(),
  ]);

  if (!projet) {
    notFound();
  }

  const authUser = authUserRes.data.user;

  const [
    currentUserRes,
    contrats,
    finance,
    temps,
    documents,
    rdvsFormateurs,
    performance,
    echeancierTemplates,
  ] = await Promise.all([
    authUser
      ? supabase.from('users').select('role').eq('id', authUser.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    getContratsByProjetId(projet.id),
    getProjetFinance(projet.id),
    getProjetTempsStats(projet.id),
    getDocumentsByProjetId(projet.id),
    getRdvFormateursByProjetId(projet.id),
    getProjetPerformance(projet.id),
    listEcheancierTemplates(),
  ]);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);
  const apprentisActifs = contrats.filter((c) =>
    isContratActif(c.contract_state),
  ).length;

  // 4 zones ancrées + sous-nav sticky scroll-spy : le CDP scanne tout le
  // projet au scroll, la nav donne l'orientation (pas de tabs qui cachent).
  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Projets', href: '/projets' }, { label: ref }]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <ProjetDetailHeader projet={projet} />
        {userIsAdmin && (
          <ProjetDuplicateButton
            projetId={projet.id}
            projetRef={projet.ref ?? ''}
          />
        )}
      </div>

      <SectionNav
        items={[
          { id: 'synthese', label: 'Synthèse' },
          { id: 'finance', label: 'Finance' },
          { id: 'contrats', label: 'Contrats' },
          { id: 'activite', label: 'Activité' },
        ]}
      />

      <section id="synthese" className="scroll-mt-16">
        <ProjetStatCards projet={projet} apprentisActifs={apprentisActifs} />
        <div className="mt-6">
          <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
            Volets de performance
          </h3>
          <ProjetPerformanceVolets data={performance} />
        </div>
      </section>

      <section id="finance" className="mt-8 scroll-mt-16">
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
          <div className="space-y-6">
            <ProjetTempsSection temps={temps} />
            <ProjetQualiteSection
              clientTrigramme={projet.client?.trigramme ?? null}
            />
          </div>
        </div>
        <div className="mt-4">
          <ProjetEcheancierManualPlaceholder />
        </div>
      </section>

      <section id="contrats" className="mt-8 scroll-mt-16">
        <ProjetContratsTable contrats={contrats} />
      </section>

      <section id="activite" className="mt-8 scroll-mt-16 space-y-6">
        <ProjetRdvSection projetId={projet.id} rdvs={rdvsFormateurs} />
        <ProjetDocumentsSection
          projetId={projet.id}
          projetRef={ref}
          documents={documents}
        />
      </section>
    </div>
  );
}
