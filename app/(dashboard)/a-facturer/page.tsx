import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getContratsAFacturer } from '@/lib/queries/contrats-a-facturer';
import {
  listBillableProjets,
  getBillableEventsForProjets,
} from '@/lib/queries/billable-events';
import { buildResteAFacturer } from '@/lib/utils/reste-a-facturer';
import { PageHeader } from '@/components/shared/page-header';
import { AFacturerTable } from '@/components/a-facturer/a-facturer-table';
import { ResteAFacturerTab } from '@/components/facturation/reste-a-facturer-tab';

export const metadata: Metadata = { title: 'À facturer - SOLUVIA' };
export const revalidate = 30;

// Surface unique du "qu'est-ce qu'il reste à facturer" : contrats OPCO dus
// (échéancier) + reste à facturer par contrat (modèle engagement). L'ancien
// onglet "Reste à facturer" de /facturation vit désormais ici.
export default async function AFacturerPage() {
  const user = await getUser();
  if (!user || (!isAdmin(user.role) && user.role !== 'cdp')) {
    redirect('/accueil');
  }

  const [rows, manualProjetsList] = await Promise.all([
    getContratsAFacturer(),
    listBillableProjets(),
  ]);
  const manualProjets = await getBillableEventsForProjets(
    manualProjetsList.map((p) => p.id),
  );
  const raf =
    manualProjets.length > 0 ? buildResteAFacturer(manualProjets) : null;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="À facturer"
          description="Contrats dont une échéance OPCO est due et non encore transmise sur Eduvia"
        />
        <AFacturerTable data={rows} />
      </div>
      {raf && (
        <div>
          <h2 className="text-foreground mb-1 text-lg font-semibold">
            Reste à facturer par contrat
          </h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Part des contrats pas encore facturée : montant attendu moins ce qui
            a déjà été émis.
          </p>
          <ResteAFacturerTab raf={raf} />
        </div>
      )}
    </div>
  );
}
