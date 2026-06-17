import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { getLinkedinEvents, getMappingRules } from '@/lib/queries/linkedin';
import { getCommerciaux } from '@/lib/queries/prospects';
import { PageHeader } from '@/components/shared/page-header';
import { LinkedinEventsList } from '@/components/commercial/linkedin/events-list';
import { MappingRulesManager } from '@/components/commercial/linkedin/mapping-rules-manager';

export const metadata: Metadata = {
  title: 'Connecteur LinkedIn - SOLUVIA',
};

export default async function LinkedinPage() {
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

  const admin = isAdmin(currentUser?.role);

  const [events, rules, developpeurs] = await Promise.all([
    getLinkedinEvents(),
    admin ? getMappingRules() : Promise.resolve([]),
    admin ? getCommerciaux() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connecteur LinkedIn"
        description="Évènements de prospection captés et règles d'affectation des prospects"
      />
      {admin && (
        <MappingRulesManager rules={rules} developpeurs={developpeurs} />
      )}
      <LinkedinEventsList events={events} />
    </div>
  );
}
