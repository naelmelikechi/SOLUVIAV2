import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  MOCK_FINANCE,
  MOCK_TEMPS,
  MOCK_QUALITE,
} from '@/lib/mock-data';
import { ProjetDetailHeader } from '@/components/projets/projet-detail-header';
import { ProjetStatCards } from '@/components/projets/projet-stat-cards';
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';
import { ProjetContratsTable } from '@/components/projets/projet-contrats-table';

export default async function ProjetDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = getProjetByRef(ref);

  if (!projet) {
    notFound();
  }

  const contrats = getContratsByProjetId(projet.id);
  const finance = MOCK_FINANCE[projet.id];
  const temps = MOCK_TEMPS[projet.id];
  const qualite = MOCK_QUALITE[projet.id];

  return (
    <div>
      <ProjetDetailHeader projet={projet} />
      <ProjetStatCards projet={projet} />

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
