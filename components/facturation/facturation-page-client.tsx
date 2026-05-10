'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Download,
  FileText,
  List,
  Loader2,
  Plus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, buttonVariants } from '@/components/ui/button';
import { NewFactureDialog } from '@/components/facturation/new-facture-dialog';
import { DataTable } from '@/components/shared/data-table';
import type { FilterOption } from '@/components/shared/data-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BillingPeriodBanner } from '@/components/facturation/billing-period-banner';
import { EcheanceTable } from '@/components/facturation/echeance-table';
import { EcheanceCalendar } from '@/components/facturation/echeance-calendar';
import { createFactureListColumns } from '@/components/facturation/facture-list-columns';
import { AjustementsList } from '@/components/facturation/ajustements-list';
import { EcheanceApercuHtml } from '@/components/facturation/echeance-apercu-html';
import { BrouillonsTab } from '@/components/facturation/brouillons-tab';
import { ManuelTab } from '@/components/facturation/manuel-tab';
import { EmptyState } from '@/components/shared/empty-state';
import type {
  FactureListItem,
  EcheancePending,
  BrouillonItem,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import type { AjustementPending } from '@/lib/queries/ajustements';
import type { ProjetBillableEvents } from '@/lib/queries/billable-events';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_FACTURE_LABELS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';

const FACTURE_FILTERS: FilterOption[] = [
  {
    column: 'statut',
    label: 'Statut',
    options: [
      { label: 'Émise', value: 'emise' },
      { label: 'Payée', value: 'payee' },
      { label: 'En retard', value: 'en_retard' },
      { label: 'Avoir', value: 'avoir' },
    ],
  },
];

interface FacturationPageClientProps {
  factures: FactureListItem[];
  echeances: EcheancePending[];
  ajustements: AjustementPending[];
  brouillons: BrouillonItem[];
  manualProjets: ProjetBillableEvents[];
  projetsForFacturation: Awaited<ReturnType<typeof listProjetsForFacturation>>;
}

export function FacturationPageClient({
  factures,
  echeances,
  ajustements,
  brouillons,
  manualProjets,
  projetsForFacturation,
}: FacturationPageClientProps) {
  const router = useRouter();
  // Onglet par defaut : Brouillons s'il y en a (priorite revue), sinon
  // Echeances. Le user peut toujours basculer manuellement.
  const [activeTab, setActiveTab] = useState(brouillons.length > 0 ? 0 : 1);
  const [echeanceView, setEcheanceView] = useState<'list' | 'calendar'>('list');
  const [newFactureOpen, setNewFactureOpen] = useState(false);
  const [preview, setPreview] = useState<
    { kind: 'facture'; ref: string } | { kind: 'echeance'; id: string } | null
  >(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const factureColumns = useMemo(
    () =>
      createFactureListColumns((ref) => {
        setPreviewLoaded(false);
        setPreview({ kind: 'facture', ref });
      }),
    [],
  );

  const previewTitle =
    preview?.kind === 'facture'
      ? `Aperçu de la facture ${preview.ref}`
      : preview?.kind === 'echeance'
        ? 'Aperçu de l\u2019échéance (brouillon)'
        : '';

  const previewInlineUrl =
    preview?.kind === 'facture'
      ? `/api/factures/${preview.ref}/pdf?inline=true`
      : '';

  const previewDownloadUrl =
    preview?.kind === 'facture'
      ? `/api/factures/${preview.ref}/pdf`
      : preview?.kind === 'echeance'
        ? `/api/echeances/${preview.id}/pdf-preview`
        : null;

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

  if (
    factures.length === 0 &&
    echeances.length === 0 &&
    ajustements.length === 0 &&
    brouillons.length === 0 &&
    manualProjets.length === 0
  ) {
    return (
      <>
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => setNewFactureOpen(true)}
            disabled={projetsForFacturation.length === 0}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {'Nouvelle facture'}
          </Button>
        </div>
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description="Les échéances sont générées automatiquement depuis les contrats actifs. Les factures apparaîtront ici une fois émises depuis ces échéances."
        />
        <NewFactureDialog
          open={newFactureOpen}
          onOpenChange={setNewFactureOpen}
          initialProjets={projetsForFacturation}
        />
      </>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          onClick={() => setNewFactureOpen(true)}
          disabled={projetsForFacturation.length === 0}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {'Nouvelle facture'}
        </Button>
      </div>
      <TabsList variant="line">
        <TabsTrigger value={0}>
          {'Brouillons'}
          {brouillons.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-bold text-white">
              {brouillons.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value={1}>
          {'Échéances'}
          {echeances.length > 0 && (
            <span className="bg-primary ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white">
              {echeances.length}
            </span>
          )}
        </TabsTrigger>
        {manualProjets.length > 0 && (
          <TabsTrigger value={2}>
            {'Manuel'}
            <span className="text-muted-foreground ml-1.5 text-xs">
              ({manualProjets.length})
            </span>
          </TabsTrigger>
        )}
        <TabsTrigger value={3}>
          {'Factures'}
          <span className="text-muted-foreground ml-1.5 text-xs">
            ({factures.length})
          </span>
        </TabsTrigger>
        <TabsTrigger value={4}>
          {'Ajustements'}
          {ajustements.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-bold text-white">
              {ajustements.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value={0}>
        <div className="mt-4">
          <BrouillonsTab brouillons={brouillons} />
        </div>
      </TabsContent>

      <TabsContent value={1}>
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
            <EcheanceTable
              echeances={echeances}
              onPreview={(id) => {
                setPreviewLoaded(false);
                setPreview({ kind: 'echeance', id });
              }}
            />
          ) : (
            <EcheanceCalendar echeances={echeances} />
          )}
        </div>
      </TabsContent>

      {manualProjets.length > 0 && (
        <TabsContent value={2}>
          <div className="mt-4">
            <ManuelTab projets={manualProjets} />
          </div>
        </TabsContent>
      )}

      <TabsContent value={3}>
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-4 w-4" />
              Export Excel
            </Button>
          </div>
          <DataTable
            columns={factureColumns}
            data={factures}
            searchKey="ref"
            searchPlaceholder="Rechercher une facture..."
            onRowClick={handleRowClick}
            defaultSort={{ id: 'ref', desc: true }}
            filters={FACTURE_FILTERS}
          />
        </div>
      </TabsContent>

      <TabsContent value={4}>
        <div className="mt-4">
          <AjustementsList ajustements={ajustements} />
        </div>
      </TabsContent>

      <Sheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
            setPreviewLoaded(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex !w-[min(800px,95vw)] flex-col gap-0 p-0 data-[side=right]:sm:max-w-[min(800px,95vw)]"
        >
          <SheetHeader className="border-border flex flex-row items-center justify-between border-b p-4 pr-12">
            <SheetTitle>{previewTitle}</SheetTitle>
            {previewDownloadUrl && (
              <a
                href={previewDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Télécharger
              </a>
            )}
          </SheetHeader>
          {preview?.kind === 'echeance' && (
            <EcheanceApercuHtml key={preview.id} echeanceId={preview.id} />
          )}
          {preview?.kind === 'facture' && (
            <div className="relative flex-1">
              {!previewLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                  <p className="text-muted-foreground text-sm">
                    Chargement de la facture...
                  </p>
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <iframe
                key={preview.ref}
                src={previewInlineUrl}
                title={previewTitle}
                onLoad={() => setPreviewLoaded(true)}
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NewFactureDialog
        open={newFactureOpen}
        onOpenChange={setNewFactureOpen}
        initialProjets={projetsForFacturation}
      />
    </Tabs>
  );
}
