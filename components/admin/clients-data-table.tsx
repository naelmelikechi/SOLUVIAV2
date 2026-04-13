'use client';

import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import type { ClientListItem } from '@/lib/queries/clients';
import { DataTable } from '@/components/shared/data-table';
import { clientListColumns } from '@/components/admin/client-list-columns';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/formatters';

export function ClientsDataTable({ data }: { data: ClientListItem[] }) {
  const router = useRouter();

  const handleRowClick = (row: ClientListItem) => {
    router.push(`/admin/clients/${row.id}`);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = data.map((c) => ({
      Trigramme: c.trigramme,
      'Raison sociale': c.raison_sociale,
      SIRET: c.siret ?? '',
      Localisation: c.localisation ?? '',
      'Date entrée': c.date_entree ? formatDate(c.date_entree) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(
      wb,
      `clients_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>
      <DataTable
        columns={clientListColumns}
        data={data}
        searchKey="raison_sociale"
        searchPlaceholder="Rechercher un client..."
        onRowClick={handleRowClick}
      />
    </div>
  );
}
