import type { Metadata } from 'next';
import {
  getFacturesList,
  getEcheancesPending,
  getBrouillons,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import { listAjustementsPending } from '@/lib/queries/ajustements';
import {
  listManualProjets,
  getBillableEvents,
  type ProjetBillableEvents,
} from '@/lib/queries/billable-events';
import { PageHeader } from '@/components/shared/page-header';
import { FacturationPageClient } from '@/components/facturation/facturation-page-client';

export const metadata: Metadata = { title: 'Facturation - SOLUVIA' };
export const revalidate = 30;

export default async function FacturationPage() {
  const [
    factures,
    echeances,
    ajustements,
    brouillons,
    manualProjetsList,
    projetsForFacturation,
  ] = await Promise.all([
    getFacturesList(),
    getEcheancesPending(),
    listAjustementsPending(),
    getBrouillons(),
    listManualProjets(),
    listProjetsForFacturation(),
  ]);

  // Charge les events facturables pour chaque projet manuel (en parallele).
  // Si pas de projet manuel, on passe un tableau vide a l'onglet Manuel.
  const manualProjetsEvents: ProjetBillableEvents[] = (
    await Promise.all(manualProjetsList.map((p) => getBillableEvents(p.id)))
  ).filter((p): p is ProjetBillableEvents => p !== null);

  return (
    <div>
      <PageHeader title="Facturation" />
      <FacturationPageClient
        factures={factures}
        echeances={echeances}
        ajustements={ajustements}
        brouillons={brouillons}
        manualProjets={manualProjetsEvents}
        projetsForFacturation={projetsForFacturation}
      />
    </div>
  );
}
