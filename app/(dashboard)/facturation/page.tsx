import type { Metadata } from 'next';
import {
  getFacturesList,
  getEcheancesPending,
  getBrouillons,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import { listAjustementsPending } from '@/lib/queries/ajustements';
import {
  listBillableProjets,
  getBillableEvents,
  type ProjetBillableEvents,
} from '@/lib/queries/billable-events';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { FacturationPageClient } from '@/components/facturation/facturation-page-client';

export const metadata: Metadata = { title: 'Facturation - SOLUVIA' };
export const revalidate = 30;

export default async function FacturationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    factures,
    echeances,
    ajustements,
    brouillons,
    manualProjetsList,
    projetsForFacturation,
    currentUserRes,
    clientsForFacturation,
  ] = await Promise.all([
    getFacturesList(),
    getEcheancesPending(),
    listAjustementsPending(),
    getBrouillons(),
    listBillableProjets(),
    listProjetsForFacturation(),
    user
      ? supabase.from('users').select('role').eq('id', user.id).single()
      : Promise.resolve({ data: null as { role: string | null } | null }),
    // Clients réels pour le dialog "Nouvelle facture libre" (admin only).
    // Le pseudo-client INT (Interne SOLUVIA) est exclu, ainsi que les
    // clients archivés.
    supabase
      .from('clients')
      .select('id, trigramme, raison_sociale')
      .eq('archive', false)
      .neq('trigramme', 'INT')
      .order('raison_sociale'),
  ]);

  // Charge les events facturables pour chaque projet billable (en parallele).
  // Si pas de projet billable, on passe un tableau vide a l'onglet facturation.
  const manualProjetsEvents: ProjetBillableEvents[] = (
    await Promise.all(manualProjetsList.map((p) => getBillableEvents(p.id)))
  ).filter((p): p is ProjetBillableEvents => p !== null);

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

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
        clientsForFreeFacture={clientsForFacturation.data ?? []}
        isAdmin={userIsAdmin}
      />
    </div>
  );
}
