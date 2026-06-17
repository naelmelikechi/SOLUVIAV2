import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type DocumentTemplate =
  Database['public']['Tables']['document_templates']['Row'];
export type DocumentTemplateVersion =
  Database['public']['Tables']['document_template_versions']['Row'];

type Publisher = { nom: string; prenom: string } | null;
export type TemplateVersionWithPublisher = DocumentTemplateVersion & {
  publisher: Publisher;
};

export type TemplateWithActive = DocumentTemplate & {
  active_version: TemplateVersionWithPublisher | null;
  versions_count: number;
};

/**
 * Liste des modèles documentaires (Feature 4) avec leur version active et le
 * nombre de versions. 2 requêtes (templates + versions), agrégation en mémoire.
 */
export async function getTemplatesWithActiveVersion(): Promise<
  TemplateWithActive[]
> {
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from('document_templates')
    .select('*')
    .order('ordre', { ascending: true });

  if (error) {
    logger.error('queries.templates', 'getTemplates failed', { error });
    return [];
  }

  const { data: versions } = await supabase
    .from('document_template_versions')
    .select(
      '*, publisher:users!document_template_versions_published_by_fkey(nom, prenom)',
    )
    .order('version', { ascending: false });

  const byTemplate = new Map<string, TemplateVersionWithPublisher[]>();
  for (const v of (versions ?? []) as TemplateVersionWithPublisher[]) {
    const arr = byTemplate.get(v.template_id) ?? [];
    arr.push(v);
    byTemplate.set(v.template_id, arr);
  }

  return (templates ?? []).map((t) => {
    const vs = byTemplate.get(t.id) ?? [];
    return {
      ...t,
      active_version: vs.find((v) => v.active) ?? null,
      versions_count: vs.length,
    };
  });
}

export async function getTemplateVersions(
  templateId: string,
): Promise<TemplateVersionWithPublisher[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_template_versions')
    .select(
      '*, publisher:users!document_template_versions_published_by_fkey(nom, prenom)',
    )
    .eq('template_id', templateId)
    .order('version', { ascending: false });

  if (error) {
    logger.error('queries.templates', 'getTemplateVersions failed', {
      templateId,
      error,
    });
    return [];
  }
  return (data ?? []) as TemplateVersionWithPublisher[];
}
