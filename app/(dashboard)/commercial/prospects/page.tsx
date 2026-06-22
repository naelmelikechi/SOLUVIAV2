import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getProspectsList,
  getProspectsGroupedByStage,
  getProspectRegions,
  getCommerciaux,
  getProspectTimeInStageMedian,
} from '@/lib/queries/prospects';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ProspectsView } from '@/components/commercial/prospects-view';
import { ProspectCreateButton } from '@/components/commercial/prospect-create-button';

export const metadata: Metadata = {
  title: 'Prospects - SOLUVIA',
};

export default async function ProspectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();

  if (!canAccessPipeline(currentUser?.role, currentUser?.pipeline_access)) {
    redirect('/accueil');
  }

  const [prospects, grouped, regions, commerciaux, stageMedians] =
    await Promise.all([
      getProspectsList(),
      getProspectsGroupedByStage(),
      getProspectRegions(),
      getCommerciaux(),
      getProspectTimeInStageMedian(),
    ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Prospects" description="Pipeline commercial">
        <ProspectCreateButton />
      </PageHeader>
      <ProspectsView
        prospects={prospects}
        grouped={grouped}
        regions={regions}
        commerciaux={commerciaux}
        currentUserId={user.id}
        isAdmin={isAdmin(currentUser?.role)}
        stageMedians={stageMedians}
      />
    </div>
  );
}
