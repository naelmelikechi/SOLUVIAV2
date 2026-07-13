import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getFacturesPage,
  getFacturationKpis,
  getBrouillons,
  listProjetsForFacturation,
} from '@/lib/queries/factures';
import { FacturationKpisStrip } from '@/components/facturation/facturation-kpis';
import { listAjustementsPending } from '@/lib/queries/ajustements';
import {
  listBillableProjets,
  getBillableEventsForProjets,
} from '@/lib/queries/billable-events';
import {
  getEcheancierDues,
  currentMoisCutoff,
} from '@/lib/queries/echeancier-dues';
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
    kpis,
    ajustements,
    brouillons,
    manualProjetsList,
    echeancier,
    echeancierProjetsList,
    projetsForFacturation,
    currentUserRes,
    clientsForFacturation,
    societesActives,
  ] = await Promise.all([
    getFacturesPage({ limit: 25 }),
    getFacturationKpis(),
    listAjustementsPending(),
    getBrouillons(),
    // Onglet "A l'engagement" : uniquement les projets de ce modele.
    listBillableProjets('engagement'),
    getEcheancierDues(),
    // Selecteur de l'onglet Echeancier : projets de ce modele avec >=1 contrat
    // (exclut de fait les projets internes, sans contrat Eduvia).
    listBillableProjets('echeancier'),
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

  const aEmettreMontantHt = brouillons.reduce(
    (s, b) => s + Number(b.montant_ht ?? 0),
    0,
  );

  return (
    <div>
      <PageHeader title="Facturation" />
      <div className="mb-6">
        <FacturationKpisStrip
          kpis={kpis}
          aEmettreCount={brouillons.length}
          aEmettreMontantHt={aEmettreMontantHt}
        />
      </div>
      <FacturationPageClient
        facturesPage={facturesPage}
        ajustements={ajustements}
        brouillons={brouillons}
        manualProjets={manualProjetsEvents}
        echeancierDues={echeancier.dues}
        echeancierProjets={echeancierProjetsList}
        echeancierCutoff={currentMoisCutoff()}
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
