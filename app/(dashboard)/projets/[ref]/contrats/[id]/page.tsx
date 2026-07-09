import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getContratDetail } from '@/lib/queries/contrats';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import {
  ContratDetailSections,
  ContratStateBadge,
} from '@/components/projets/contrat-detail-sections';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string; id: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Contrat - ${ref} - SOLUVIA` };
}

// Fiche complète d'un contrat (doctrine disclosure : une entité avec cycle de
// vie a sa propre URL). Le Sheet de la table reste le coup d'oeil rapide.
export default async function ContratDetailPage({
  params,
}: {
  params: Promise<{ ref: string; id: string }>;
}) {
  const { ref, id } = await params;
  const data = await getContratDetail(id);
  // Le contrat doit appartenir au projet de l'URL (pas de fiche orpheline
  // sous un mauvais breadcrumb).
  if (!data || data.contrat.projet?.ref !== ref) notFound();

  const apprenant = [
    data.contrat.apprenant_prenom,
    data.contrat.apprenant_nom?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Projets', href: '/projets' },
          { label: ref, href: `/projets/${ref}` },
          { label: apprenant || 'Contrat' },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">
            {apprenant || 'Contrat'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data.contrat.formation_titre ?? 'Formation non renseignée'}
          </p>
        </div>
        <ContratStateBadge state={data.contrat.contract_state} />
      </div>
      <div className="max-w-3xl">
        <ContratDetailSections data={data} />
      </div>
    </div>
  );
}
