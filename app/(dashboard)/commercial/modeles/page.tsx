import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getTemplatesWithActiveVersion,
  getTemplateVersions,
} from '@/lib/queries/templates';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline, isAdmin } from '@/lib/utils/roles';
import { PageHeader } from '@/components/shared/page-header';
import {
  TemplatesList,
  type TemplateListItem,
} from '@/components/commercial/modeles/templates-list';

export const metadata: Metadata = {
  title: 'Bibliothèque de modèles - SOLUVIA',
};

export default async function ModelesPage() {
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

  const templates = await getTemplatesWithActiveVersion();
  // Historique complet par modèle : borné à ~5 modèles, Promise.all acceptable.
  const versionsLists = await Promise.all(
    templates.map((t) => getTemplateVersions(t.id)),
  );
  const items: TemplateListItem[] = templates.map((template, i) => ({
    template,
    versions: versionsLists[i] ?? [],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bibliothèque de modèles"
        description="Modèles documentaires du tunnel commercial"
      />
      <TemplatesList templates={items} isAdmin={isAdmin(currentUser?.role)} />
    </div>
  );
}
