import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getCdpPlanDeCharge,
  getClientsAAffecter,
  getCdpCandidates,
  getCdpPipeline,
} from '@/lib/queries/cdp';
import { createClient } from '@/lib/supabase/server';
import { isReferentCdp } from '@/lib/utils/roles';
import type { DispoCdp } from '@/lib/utils/constants';
import { PageHeader } from '@/components/shared/page-header';
import { PlanDeChargeTable } from '@/components/commercial/cdp/plan-de-charge-table';
import { ArbitragePanel } from '@/components/commercial/cdp/arbitrage-panel';
import { DispoSelector } from '@/components/commercial/cdp/dispo-selector';
import { CdpPipelineList } from '@/components/commercial/cdp/cdp-pipeline-list';

export const metadata: Metadata = {
  title: 'Plan de charge CDP - SOLUVIA',
};

export default async function CdpPage({
  searchParams,
}: {
  searchParams: Promise<{ cdp?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, referent_cdp, cdp_disponibilite')
    .eq('id', user.id)
    .single();

  if (!isReferentCdp(currentUser?.role, currentUser?.referent_cdp)) {
    redirect('/projets');
  }

  const { cdp: selectedCdpId } = await searchParams;

  const [lines, clientsAAffecter, candidates] = await Promise.all([
    getCdpPlanDeCharge(),
    getClientsAAffecter(),
    getCdpCandidates(),
  ]);

  const selectedLine = selectedCdpId
    ? lines.find((l) => l.cdp.id === selectedCdpId)
    : undefined;
  const pipeline = selectedLine
    ? await getCdpPipeline(selectedLine.cdp.id)
    : [];

  const isCdp =
    currentUser?.referent_cdp === true || currentUser?.role === 'cdp';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan de charge CDP"
        description="Charge, saturation et arbitrage des chefs de projet référents"
      >
        {isCdp && (
          <DispoSelector
            value={(currentUser?.cdp_disponibilite as DispoCdp | null) ?? null}
          />
        )}
      </PageHeader>

      <PlanDeChargeTable lines={lines} />

      {selectedLine && (
        <CdpPipelineList
          cdpNom={`${selectedLine.cdp.prenom} ${selectedLine.cdp.nom}`}
          clients={pipeline}
        />
      )}

      <ArbitragePanel
        clientsAAffecter={clientsAAffecter}
        cdps={candidates}
        lines={lines}
      />
    </div>
  );
}
