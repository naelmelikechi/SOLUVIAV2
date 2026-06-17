import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProspectsList, getCommerciaux } from '@/lib/queries/prospects';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import { ProspectsDataTable } from '@/components/commercial/prospects-data-table';
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
    redirect('/projets');
  }

  const [prospects, commerciaux] = await Promise.all([
    getProspectsList(),
    getCommerciaux(),
  ]);

  return (
    <div>
      <PageHeader title="Prospects" description="Pipeline commercial">
        <ProspectCreateButton />
      </PageHeader>
      <ProspectsDataTable
        data={prospects}
        commerciaux={commerciaux}
        currentUserId={user.id}
      />
    </div>
  );
}
