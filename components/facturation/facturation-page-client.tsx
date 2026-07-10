'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Download,
  FileText,
  FolderKanban,
  Loader2,
  Plus,
  ReceiptText,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NewFactureDialog } from '@/components/facturation/new-facture-dialog';
import {
  NewFactureLibreDialog,
  type FreeFactureClientOption,
  type SocieteOption,
} from '@/components/facturation/new-facture-libre-dialog';
import { DataTable } from '@/components/shared/data-table';
import type { FilterOption, ServerQuery } from '@/components/shared/data-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { createFactureListColumns } from '@/components/facturation/facture-list-columns';
import { AjustementsList } from '@/components/facturation/ajustements-list';
import { BrouillonsTab } from '@/components/facturation/brouillons-tab';
import { ManuelTab } from '@/components/facturation/manuel-tab';
import { EcheancierTab } from '@/components/facturation/echeancier-tab';
import { EmptyState } from '@/components/shared/empty-state';
import { TermeHint } from '@/components/shared/terme-hint';
import type {
  FactureListItem,
  FacturesPage,
  FacturesPageParams,
  FactureStatutFiltrable,
  BrouillonItem,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import { fetchFacturesPage } from '@/lib/actions/factures/list';
import type { AjustementPending } from '@/lib/queries/ajustements';
import type { ProjetBillableEvents } from '@/lib/queries/billable-events';
import type { EcheancierDueMois } from '@/lib/queries/echeancier-dues';

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

const FACTURES_PAGE_SIZE = 25;

const STATUTS_FILTRABLES: readonly FactureStatutFiltrable[] = [
  'emise',
  'payee',
  'en_retard',
  'avoir',
];

// Mappe la ServerQuery (etat toolbar) vers les params de getFacturesPage.
// Filtre les statuts au sous-ensemble filtrable (narrow via type guard, pas
// de cast). Utilise au re-filtrage ET au « Voir plus ».
function toPageParams(
  query: ServerQuery,
  cursor: string | null,
): FacturesPageParams {
  return {
    limit: FACTURES_PAGE_SIZE,
    cursor: cursor ?? undefined,
    statuts: query.statuts?.filter((s): s is FactureStatutFiltrable =>
      (STATUTS_FILTRABLES as readonly string[]).includes(s),
    ),
    searchRef: query.searchRef,
    filterProjet: query.filterProjet,
    filterClient: query.filterClient,
  };
}

interface FacturationPageClientProps {
  facturesPage: FacturesPage;
  ajustements: AjustementPending[];
  brouillons: BrouillonItem[];
  manualProjets: ProjetBillableEvents[];
  echeancierDues: EcheancierDueMois[];
  hasEcheancierProjets: boolean;
  echeancierCutoff: string;
  projetsForFacturation: Awaited<ReturnType<typeof listProjetsForFacturation>>;
  clientsForFreeFacture: FreeFactureClientOption[];
  societesEmettrices: SocieteOption[];
  isAdmin: boolean;
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function FacturationPageClient({
  facturesPage,
  ajustements,
  brouillons,
  manualProjets,
  echeancierDues,
  hasEcheancierProjets,
  echeancierCutoff,
  projetsForFacturation,
  clientsForFreeFacture,
  societesEmettrices,
  isAdmin,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: FacturationPageClientProps) {
  const { push } = useRouter();
  // Onglet par défaut : À émettre s'il y a des factures en attente, sinon
  // Factures. (L'onglet Échéances legacy a été retiré : table vide en prod,
  // vérifié 2026-07-09.)
  const [activeTab, setActiveTab] = useState(brouillons.length > 0 ? 0 : 1);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [newFactureOpen, setNewFactureOpen] = useState(false);
  const [newFactureLibreOpen, setNewFactureLibreOpen] = useState(false);
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Pagination serveur keyset : la page 1 vient du SSR (facturesPage), les
  // pages suivantes / re-filtrages via la Server Action fetchFacturesPage.
  const [rows, setRows] = useState<FactureListItem[]>(facturesPage.rows);
  const [nextCursor, setNextCursor] = useState<string | null>(
    facturesPage.nextCursor,
  );
  const [total, setTotal] = useState<number | null>(facturesPage.total);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [query, setQuery] = useState<ServerQuery>({});
  // Anti-course : seule la reponse de la derniere requete emise gagne.
  const requestIdRef = useRef(0);

  const handleQueryChange = useCallback(async (next: ServerQuery) => {
    setQuery(next);
    const reqId = ++requestIdRef.current;
    const res = await fetchFacturesPage(toPageParams(next, null));
    if (reqId !== requestIdRef.current) return; // reponse perimee
    if (res.ok) {
      setRows(res.page.rows);
      setNextCursor(res.page.nextCursor);
      setTotal(res.page.total);
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    // Anti-course : si un re-filtrage (handleQueryChange) survient pendant le
    // fetch, reqId devient perime -> on n'appende pas des lignes d'un autre
    // jeu de filtres (evite le melange + curseur corrompu).
    const reqId = requestIdRef.current;
    setIsLoadingMore(true);
    const res = await fetchFacturesPage(toPageParams(query, nextCursor));
    setIsLoadingMore(false);
    if (reqId !== requestIdRef.current) return; // reponse perimee (filtre change)
    if (res.ok) {
      setRows((prev) => [...prev, ...res.page.rows]);
      setNextCursor(res.page.nextCursor);
    }
  }, [nextCursor, isLoadingMore, query]);

  const factureColumns = useMemo(
    () =>
      createFactureListColumns((ref) => {
        setPreviewLoaded(false);
        setPreviewRef(ref);
      }),
    [],
  );

  const handleRowClick = (row: FactureListItem) => {
    push(`/facturation/${row.ref}`);
  };

  const handleExport = () => {
    // L'export lit desormais toutes les lignes cote serveur (le state
    // in-memory a disparu). On propage les filtres courants a l'endpoint.
    const params = new URLSearchParams();
    for (const s of query.statuts ?? []) params.append('statut', s);
    if (query.searchRef) params.set('searchRef', query.searchRef);
    if (query.filterProjet) params.set('filterProjet', query.filterProjet);
    if (query.filterClient) params.set('filterClient', query.filterClient);
    const qs = params.toString();
    window.location.href = `/api/factures/export${qs ? `?${qs}` : ''}`;
  };

  // CTA unique : une étape de choix route vers le bon dialog existant.
  const newFactureCta = isAdmin && (
    <Button size="sm" onClick={() => setChooserOpen(true)}>
      <Plus className="mr-1.5 size-4" />
      Nouvelle facture
    </Button>
  );

  const dialogs = (
    <>
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle facture</DialogTitle>
            <DialogDescription>Que voulez-vous facturer ?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                setChooserOpen(false);
                setNewFactureOpen(true);
              }}
              disabled={projetsForFacturation.length === 0}
              className="hover:border-primary/50 hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
            >
              <FolderKanban className="text-primary mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">
                  Depuis un projet
                </span>
                <span className="text-muted-foreground block text-xs">
                  Facture liée à un projet et ses contrats (échéances,
                  commission).
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setChooserOpen(false);
                setNewFactureLibreOpen(true);
              }}
              disabled={clientsForFreeFacture.length === 0}
              className="hover:border-primary/50 hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
            >
              <ReceiptText className="text-primary mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Hors projet</span>
                <span className="text-muted-foreground block text-xs">
                  Facture libre : prestation ponctuelle, refacturation, sans
                  projet associé.
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <NewFactureDialog
        open={newFactureOpen}
        onOpenChange={setNewFactureOpen}
        initialProjets={projetsForFacturation}
      />
      {isAdmin && (
        <NewFactureLibreDialog
          open={newFactureLibreOpen}
          onOpenChange={setNewFactureLibreOpen}
          clients={clientsForFreeFacture}
          societes={societesEmettrices}
        />
      )}
    </>
  );

  if (
    (facturesPage.total ?? rows.length) === 0 &&
    ajustements.length === 0 &&
    brouillons.length === 0 &&
    manualProjets.length === 0 &&
    echeancierDues.length === 0
  ) {
    return (
      <>
        <div className="mb-3 flex justify-end gap-2">{newFactureCta}</div>
        <EmptyState
          icon={FileText}
          title="Aucune facture"
          description="Les factures apparaîtront ici une fois préparées puis émises."
          hint="Le flux : un contrat actif génère des montants à facturer, vous préparez une facture (encore modifiable), puis vous l'émettez : elle reçoit alors son numéro définitif et part au client."
        />
        {dialogs}
      </>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="mb-3 flex justify-end gap-2">{newFactureCta}</div>
      <TabsList variant="line">
        <TabsTrigger value={0}>
          À émettre
          {brouillons.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-bold text-white">
              {brouillons.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value={1}>
          Factures
          <span className="text-muted-foreground ml-1.5 text-xs">
            ({total ?? rows.length})
          </span>
          {ajustements.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-bold text-white">
              {ajustements.length}
            </span>
          )}
        </TabsTrigger>
        {manualProjets.length > 0 && (
          <TabsTrigger value={2}>
            À l&apos;engagement
            <span className="text-muted-foreground ml-1.5 text-xs">
              ({manualProjets.length})
            </span>
          </TabsTrigger>
        )}
        {hasEcheancierProjets && (
          <TabsTrigger value={3}>
            Échéancier
            {echeancierDues.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-bold text-white">
                {echeancierDues.length}
              </span>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value={0}>
        <div className="mt-4">
          {brouillons.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Rien à émettre"
              description="Aucune facture en préparation."
              hint="Une facture à émettre est préparée mais pas encore envoyée : elle reste modifiable et ne porte pas encore de numéro définitif."
            />
          ) : (
            <BrouillonsTab brouillons={brouillons} />
          )}
        </div>
      </TabsContent>

      <TabsContent value={1}>
        <div className="mt-4">
          {ajustements.length > 0 && (
            <details className="border-warning/40 bg-warning/5 mb-4 rounded-lg border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                <TermeHint terme="ajustement">
                  {ajustements.length} ajustement
                  {ajustements.length > 1 ? 's' : ''}
                </TermeHint>{' '}
                en attente : corrections à reporter sur les prochaines factures
              </summary>
              <div className="border-t px-4 py-3">
                <AjustementsList ajustements={ajustements} />
              </div>
            </details>
          )}
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 size-4" />
              Export Excel
            </Button>
          </div>
          <DataTable
            columns={factureColumns}
            data={rows}
            searchKey="ref"
            searchPlaceholder="Rechercher une facture..."
            onRowClick={handleRowClick}
            filters={FACTURE_FILTERS}
            serverMode
            onQueryChange={handleQueryChange}
            onLoadMore={handleLoadMore}
            nextCursor={nextCursor}
            total={total}
            isLoadingMore={isLoadingMore}
          />
        </div>
      </TabsContent>

      {manualProjets.length > 0 && (
        <TabsContent value={2}>
          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground text-xs">
              <TermeHint terme="commission">Commission</TermeHint> du modèle à
              l&apos;engagement : base = encaissements OPCO du client.{' '}
              <Link
                href="/a-facturer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                Voir le reste à facturer par contrat
                <ArrowRight className="size-3" />
              </Link>
            </p>
            <ManuelTab projets={manualProjets} />
          </div>
        </TabsContent>
      )}

      {hasEcheancierProjets && (
        <TabsContent value={3}>
          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground text-xs">
              <TermeHint terme="commission">Commission</TermeHint> du modèle
              échéancier : NPEC x taux, ventilé par jalons mensuels (1/12 par
              défaut). Les montants tiennent compte de ce qui a déjà été facturé
              sur chaque contrat.
            </p>
            <EcheancierTab
              dues={echeancierDues}
              cutoffMois={echeancierCutoff}
            />
          </div>
        </TabsContent>
      )}

      <Sheet
        open={previewRef !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewRef(null);
            setPreviewLoaded(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex !w-[min(800px,95vw)] flex-col gap-0 p-0 data-[side=right]:sm:max-w-[min(800px,95vw)]"
        >
          <SheetHeader className="border-border flex flex-row items-center justify-between border-b p-4 pr-12">
            <SheetTitle>{`Aperçu de la facture ${previewRef ?? ''}`}</SheetTitle>
            {previewRef && (
              <a
                href={`/api/factures/${previewRef}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download className="mr-1.5 size-4" />
                Télécharger
              </a>
            )}
          </SheetHeader>
          {previewRef && (
            <div className="relative flex-1">
              {!previewLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                  <p className="text-muted-foreground text-sm">
                    Chargement de la facture…
                  </p>
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <iframe
                key={previewRef}
                src={`/api/factures/${previewRef}/pdf?inline=true`}
                title={`Aperçu de la facture ${previewRef}`}
                onLoad={() => setPreviewLoaded(true)}
                className="absolute inset-0 size-full border-0 bg-white"
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {dialogs}
    </Tabs>
  );
}
