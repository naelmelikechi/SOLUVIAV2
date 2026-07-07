import { createCrmClient } from '@/lib/crm/supabase/server';
import type { Priorite } from '@/lib/crm/domain/enums';

export type RelanceListItem = {
  id: string;
  titre: string;
  date_echeance: string;
  fait: boolean;
  priorite: Priorite;
  note: string | null;
  opportunite: { id: string; intitule: string } | null;
  compte: { id: string; nom: string } | null;
  assignee: { prenom: string | null; nom: string | null } | null;
};

export async function listRelances(): Promise<RelanceListItem[]> {
  const supabase = await createCrmClient();
  // assignee vit dans `public.users` (embed cross-schema via relances.assignee_id → users).
  const { data, error } = await supabase
    .from('relances')
    .select(
      `id, titre, date_echeance, fait, priorite, note,
      opportunite:opportunites(id, intitule), compte:comptes(id, nom), assignee:users!relances_assignee_id_fkey(prenom, nom)`,
    )
    .is('archived_at', null)
    .order('date_echeance');
  if (error) throw error;
  return (data ?? []) as unknown as RelanceListItem[];
}

export type RelanceArchiveItem = {
  id: string;
  titre: string;
  date_echeance: string;
  priorite: Priorite;
  archived_at: string | null;
  opportunite: { id: string; intitule: string } | null;
  compte: { id: string; nom: string } | null;
};

/** Relances archivées (suppression douce), pour la vue Archives. */
export async function listRelancesArchivees(): Promise<RelanceArchiveItem[]> {
  const supabase = await createCrmClient();
  const { data, error } = await supabase
    .from('relances')
    .select(
      `id, titre, date_echeance, priorite, archived_at,
      opportunite:opportunites(id, intitule), compte:comptes(id, nom)`,
    )
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    // Les archives s'accumulent sans borne (soft-delete par design) : la vue
    // Archives montre les 200 plus récentes, le reste demeure en base.
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as RelanceArchiveItem[];
}
