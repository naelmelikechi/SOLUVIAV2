'use client';

import { useRouter } from 'next/navigation';
import { Download, ClipboardList } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ProjetListItem } from '@/lib/queries/projets';
import { DataTable } from '@/components/shared/data-table';
import { projetListColumns } from '@/components/projets/projet-list-columns';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_PROJET_LABELS } from '@/lib/utils/constants';

export function ProjetsDataTable({ data }: { data: ProjetListItem[] }) {
  const router = useRouter();

  const handleRowClick = (row: ProjetListItem) => {
    router.push(`/projets/${row.ref}`);
  };

  const handleExport = () => {
    const rows = data.map((p) => ({
      Ref: p.ref ?? '',
      Client: p.client?.raison_sociale ?? '',
      Typologie: p.typologie?.libelle ?? '',
      CDP: p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '',
      Statut: STATUT_PROJET_LABELS[p.statut] || p.statut,
      'Date début': p.date_debut ? formatDate(p.date_debut) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projets');
    XLSX.writeFile(
      wb,
      `projets_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  if (data.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Aucun projet"
        description="Il n'y a pas encore de projet enregistre. Les projets apparaitront ici une fois synchronises depuis Eduvia."
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
        columns={projetListColumns}
        data={data}
        searchKey="ref"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
      />
    </div>
  );
}
