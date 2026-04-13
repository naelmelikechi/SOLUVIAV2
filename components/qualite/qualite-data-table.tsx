'use client';

import { useRouter } from 'next/navigation';
import { Download, CheckCircle } from 'lucide-react';
import type { QualiteSummary } from '@/lib/queries/qualite';
import { DataTable } from '@/components/shared/data-table';
import { qualiteListColumns } from '@/components/qualite/qualite-list-columns';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

export function QualiteDataTable({ data }: { data: QualiteSummary[] }) {
  const router = useRouter();

  const handleRowClick = (row: QualiteSummary) => {
    router.push(`/qualite/${row.projet.ref ?? ''}`);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = data.map((q) => ({
      Projet: q.projet.ref ?? '',
      Client: q.projet.client?.raison_sociale ?? '',
      CDP: q.projet.cdp ? `${q.projet.cdp.prenom} ${q.projet.cdp.nom}` : '',
      'Total tâches': q.total,
      Terminées: q.terminees,
      'À réaliser': q.a_realiser,
      'Taux (%)': q.pct,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Qualité');
    XLSX.writeFile(
      wb,
      `qualite_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  if (data.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Aucune tâche qualité"
        description="Aucun projet actif n'a de tâches qualité associées. Les tâches apparaîtront ici pour les projets actifs."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>
      <DataTable
        columns={qualiteListColumns}
        data={data}
        searchKey="ref"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
      />
    </div>
  );
}
