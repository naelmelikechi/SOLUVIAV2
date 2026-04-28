import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getProspectsGroupedByStage,
  getProspectRegions,
  getCommerciaux,
  getProspectTimeInStageMedian,
} from '@/lib/queries/prospects';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { PipelineBoard } from '@/components/commercial/pipeline-board';

export const metadata: Metadata = {
  title: 'Pipeline commercial - SOLUVIA',
};

export default async function PipelinePage() {
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
    redirect('/projets');
  }

  const [grouped, regions, commerciaux, stageMedians] = await Promise.all([
    getProspectsGroupedByStage(),
    getProspectRegions(),
    getCommerciaux(),
    getProspectTimeInStageMedian(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Pipeline commercial</h1>
        <p className="text-muted-foreground text-sm">
          Suivi de la prospection CFA et entreprises
        </p>
      </div>
      <PipelineBoard
        initialGrouped={grouped}
        commerciaux={commerciaux}
        regions={regions}
        currentUserId={user.id}
        isAdmin={isAdmin(currentUser?.role)}
        stageMedians={stageMedians}
      />
    </div>
  );
}
