'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { BillingPeriodBanner } from '@/components/facturation/billing-period-banner';
import { EcheanceTable } from '@/components/facturation/echeance-table';
import { factureListColumns } from '@/components/facturation/facture-list-columns';
import type { FactureListItem, EcheancePending } from '@/lib/queries/factures';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_FACTURE_LABELS } from '@/lib/utils/constants';

interface FacturationPageClientProps {
  factures: FactureListItem[];
  echeances: EcheancePending[];
}

export function FacturationPageClient({
  factures,
  echeances,
}: FacturationPageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);

  const handleRowClick = (row: FactureListItem) => {
    router.push(`/facturation/${row.ref}`);
  };

  const handleExport = () => {
    const data = factures.map((f) => ({
      'N° Facture': f.ref,
      Projet: f.projet?.ref ?? '',
      Client: f.client?.raison_sociale ?? '',
      Émission: f.date_emission ? formatDate(f.date_emission) : '',
      Mois: f.mois_concerne,
      'Montant HT': f.montant_ht,
      Échéance: f.date_echeance ? formatDate(f.date_echeance) : '',
      État: STATUT_FACTURE_LABELS[f.statut] || f.statut,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Factures');
    XLSX.writeFile(
      wb,
      `factures_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList variant="line">
        <TabsTrigger value={0}>
          Échéances
          {echeances.length > 0 && (
            <span className="bg-primary ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white">
              {echeances.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value={1}>
          Factures
          <span className="text-muted-foreground ml-1.5 text-xs">
            ({factures.length})
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value={0}>
        <div className="mt-4 space-y-4">
          <BillingPeriodBanner />
          <EcheanceTable echeances={echeances} />
        </div>
      </TabsContent>

      <TabsContent value={1}>
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Export Excel
            </Button>
          </div>
          <DataTable
            columns={factureListColumns}
            data={factures}
            searchKey="ref"
            searchPlaceholder="Rechercher une facture..."
            onRowClick={handleRowClick}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
