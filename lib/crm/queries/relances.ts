import { createCrmClient } from '@/lib/crm/supabase/server';
import { fetchCrmUsers } from '@/lib/crm/queries/_users';
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
  // assignee vit dans `public.users` : PostgREST ne résout pas les embeds
  // cross-schéma, on récupère la FK brute (assignee_id) puis on recolle en JS.
  const { data, error } = await supabase
    .from('relances')
    .select(
      `id, titre, date_echeance, fait, priorite, note,
      opportunite:opportunites(id, intitule), compte:comptes(id, nom), assignee_id`,
    )
    .is('archived_at', null)
    .order('date_echeance');
  if (error) throw error;
  const rows = (data ?? []) as unknown as (Omit<RelanceListItem, 'assignee'> & {
    assignee_id: string | null;
  })[];
  const users = await fetchCrmUsers(rows.map((r) => r.assignee_id));
  return rows.map(({ assignee_id, ...r }) => {
    const u = assignee_id ? users.get(assignee_id) : undefined;
    return { ...r, assignee: u ? { prenom: u.prenom, nom: u.nom } : null };
  });
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
