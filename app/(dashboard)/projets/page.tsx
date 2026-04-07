'use client';

import { useRouter } from 'next/navigation';
import { MOCK_PROJETS, type MockProjet } from '@/lib/mock-data';
import { DataTable } from '@/components/shared/data-table';
import { projetListColumns } from '@/components/projets/projet-list-columns';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';

export default function ProjetsPage() {
  const router = useRouter();

  const handleRowClick = (row: MockProjet) => {
    router.push(`/projets/${row.ref}`);
  };

  // Sort: actif first, then en_pause, termine, archive
  const sortedProjets = [...MOCK_PROJETS].sort((a, b) => {
    const order = { actif: 0, en_pause: 1, termine: 2, archive: 3 };
    return order[a.statut] - order[b.statut];
  });

  return (
    <div>
      <PageHeader
        title="Projets"
        description="Liste des projets actifs et archives"
      />
      <div
        className={cn('[&_tr:hover]:bg-card-alt/50 [&_tr]:transition-colors')}
      >
        <DataTable
          columns={projetListColumns}
          data={sortedProjets}
          searchKey="ref"
          searchPlaceholder="Rechercher un projet..."
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}
