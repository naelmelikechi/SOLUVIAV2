'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { devisColumns } from '@/components/devis/devis-list-columns';
import type { DevisListItem } from '@/lib/queries/devis';
import { formatDate } from '@/lib/utils/formatters';

const STATUT_DEVIS_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
  remplace: 'Remplacé',
  annule: 'Annulé',
};

export function DevisPageClient({ devis }: { devis: DevisListItem[] }) {
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = devis.map((d) => ({
      'N° Devis': d.ref ?? '',
      Client: d.client?.raison_sociale ?? '',
      'Société émettrice': d.societe_emettrice?.code ?? '',
      'Montant HT': d.montant_ht,
      'Montant TTC': d.montant_ttc,
      Statut: STATUT_DEVIS_LABELS[d.statut] || d.statut,
      Création: formatDate(d.created_at),
      Envoi: d.date_envoi ? formatDate(d.date_envoi) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devis');
    XLSX.writeFile(
      wb,
      `devis_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 size-4" />
          Export Excel
        </Button>
      </div>
      <DataTable columns={devisColumns} data={devis} />
    </div>
  );
}
