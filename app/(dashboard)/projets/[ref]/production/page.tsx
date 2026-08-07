import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjetByRef, getContratsByProjetId } from '@/lib/queries/projets';
import { getApprenantsByProjetId } from '@/lib/queries/apprenants';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import { getRdvFormateursByProjetId } from '@/lib/queries/rdv';
import { ProjetPerformanceVolets } from '@/components/projets/projet-performance-volets';
import { ProjetProgressionTable } from '@/components/projets/projet-progression-table';
import { ProjetSuivisFormateurs } from '@/components/projets/projet-suivis-formateurs';
import { isContratActif } from '@/lib/utils/contrat-states';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Production - ${ref} - SOLUVIA` };
}

export default async function ProjetProductionPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const [contrats, apprenants, performance, rdvs] = await Promise.all([
    getContratsByProjetId(projet.id),
    getApprenantsByProjetId(projet.id),
    getProjetPerformance(projet.id),
    getRdvFormateursByProjetId(projet.id),
  ]);

  return (
    <div className="space-y-6">
      <ProjetPerformanceVolets
        data={performance}
        apprentisActifs={
          contrats.filter((c) => isContratActif(c.contract_state)).length
        }
      />
      <ProjetProgressionTable apprenants={apprenants} />
      {/* Les suivis formateurs sont un indicateur de production, pas une piece
          de suivi administratif : ils vivent ici. */}
      <ProjetSuivisFormateurs projetId={projet.id} rdvs={rdvs} />
    </div>
  );
}
