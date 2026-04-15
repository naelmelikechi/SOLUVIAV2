'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Download, FileText, List } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import type { FilterOption } from '@/components/shared/data-table';
import { BillingPeriodBanner } from '@/components/facturation/billing-period-banner';
import { EcheanceTable } from '@/components/facturation/echeance-table';
import { EcheanceCalendar } from '@/components/facturation/echeance-calendar';
import { factureListColumns } from '@/components/facturation/facture-list-columns';
import { EmptyState } from '@/components/shared/empty-state';
import type { FactureListItem, EcheancePending } from '@/lib/queries/factures';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_FACTURE_LABELS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';

const FACTURE_FILTERS: FilterOption[] = [
  {
    column: 'statut',
    label: 'Statut',
    options: [
      { label: 'Emise', value: 'emise' },
      { label: 'Payee', value: 'payee' },
      { label: 'En retard', value: 'en_retard' },
      { label: 'Avoir', value: 'avoir' },
    ],
  },
];

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
  const [echeanceView, setEcheanceView] = useState<'list' | 'calendar'>('list');

  const handleRowClick = (row: FactureListItem) => {
    router.push(`/facturation/${row.ref}`);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
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

  if (factures.length === 0 && echeances.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucune facture"
        description="Les échéances sont générées automatiquement depuis les contrats actifs. Les factures apparaîtront ici une fois émises depuis ces échéances."
      />
    );
  }

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
          <div className="flex items-center justify-between">
            <BillingPeriodBanner />
            <div className="bg-muted inline-flex items-center rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setEcheanceView('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  echeanceView === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label="Vue liste"
              >
                <List className="h-3.5 w-3.5" />
                Liste
              </button>
              <button
                type="button"
                onClick={() => setEcheanceView('calendar')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  echeanceView === 'calendar'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label="Vue calendrier"
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendrier
              </button>
            </div>
          </div>
          {echeanceView === 'list' ? (
            <EcheanceTable echeances={echeances} />
          ) : (
            <EcheanceCalendar echeances={echeances} />
          )}
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
            defaultSort={{ id: 'ref', desc: true }}
            filters={FACTURE_FILTERS}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
