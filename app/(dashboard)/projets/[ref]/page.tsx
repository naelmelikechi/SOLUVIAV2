import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  getProjetFinance,
  getProjetTempsStats,
  getProjetQualiteStats,
} from '@/lib/queries/projets';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} — Projets — SOLUVIA` };
}
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';
import { ProjetContratsTable } from '@/components/projets/projet-contrats-table';
import { ProjetStatCards } from '@/components/projets/projet-stat-cards';
import { ProjetDetailHeader } from '@/components/projets/projet-detail-header';

export default async function ProjetDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);

  if (!projet) {
    notFound();
  }

  const [contrats, finance, temps, qualite] = await Promise.all([
    getContratsByProjetId(projet.id),
    getProjetFinance(projet.id),
    getProjetTempsStats(projet.id),
    getProjetQualiteStats(projet.id),
  ]);

  const apprentisActifs = contrats.filter(
    (c) => c.contract_state === 'actif',
  ).length;

  return (
    <div>
      <ProjetDetailHeader projet={projet} />

      <ProjetStatCards projet={projet} apprentisActifs={apprentisActifs} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ProjetFinanceSection finance={finance} />
        <div className="space-y-6">
          <ProjetTempsSection temps={temps} />
          <ProjetQualiteSection qualite={qualite} />
        </div>
      </div>

      <ProjetContratsTable contrats={contrats} />
    </div>
  );
}
