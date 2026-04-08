import { getProjetsList } from '@/lib/queries/projets';
import { PageHeader } from '@/components/shared/page-header';
import { ProjetsDataTable } from '@/components/projets/projets-data-table';

export default async function ProjetsPage() {
  const projets = await getProjetsList();

  // Sort: actif first, then en_pause, termine, archive
  const order: Record<string, number> = {
    actif: 0,
    en_pause: 1,
    termine: 2,
    archive: 3,
  };
  const sorted = [...projets].sort(
    (a, b) => (order[a.statut] ?? 99) - (order[b.statut] ?? 99),
  );

  return (
    <div>
      <PageHeader
        title="Projets"
        description="Liste des projets actifs et archivés"
      />
      <ProjetsDataTable data={sorted} />
    </div>
  );
}
