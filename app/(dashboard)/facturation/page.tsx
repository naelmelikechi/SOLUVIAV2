import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getFacturesPage,
  getEcheancesPending,
  getBrouillons,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import { listAjustementsPending } from '@/lib/queries/ajustements';
import {
  listBillableProjets,
  getBillableEventsForProjets,
} from '@/lib/queries/billable-events';
import { listSocietesEmettricesActives } from '@/lib/queries/societes-emettrices';
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
  if (!user) redirect('/login');
  const { data: me } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!isAdmin(me?.role)) redirect('/accueil');

  // oxlint-disable-next-line react-doctor/server-sequential-independent-await
  const [
    facturesPage,
    echeances,
    ajustements,
    brouillons,
    manualProjetsList,
    projetsForFacturation,
    currentUserRes,
    clientsForFacturation,
    societesActives,
  ] = await Promise.all([
    getFacturesPage({ limit: 25 }),
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
    listSocietesEmettricesActives(),
  ]);

  // Events facturables de tous les projets billable en BATCH (~6 requetes au
  // total au lieu de ~7 par projet en boucle = fin du N+1 sur cette page).
  const manualProjetsEvents = await getBillableEventsForProjets(
    manualProjetsList.map((p) => p.id),
  );

  const userIsAdmin = isAdmin(currentUserRes?.data?.role ?? null);

  return (
    <div>
      <PageHeader title="Facturation" />
      <FacturationPageClient
        facturesPage={facturesPage}
        echeances={echeances}
        ajustements={ajustements}
        brouillons={brouillons}
        manualProjets={manualProjetsEvents}
        projetsForFacturation={projetsForFacturation}
        clientsForFreeFacture={clientsForFacturation.data ?? []}
        societesEmettrices={societesActives.map((s) => ({
          id: s.id,
          code: s.code,
          raison_sociale: s.raison_sociale,
          est_defaut: s.est_defaut,
        }))}
        isAdmin={userIsAdmin}
      />
    </div>
  );
}
