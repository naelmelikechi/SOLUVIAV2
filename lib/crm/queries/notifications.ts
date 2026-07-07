import { createCrmClient } from '@/lib/crm/supabase/server';
import { cachedGetUser } from '@/lib/crm/auth/roles';
import { fetchCrmUsers } from '@/lib/crm/queries/_users';

export type NotificationItem = {
  id: string;
  type: string;
  contenu: string;
  link: string | null;
  lu: boolean;
  created_at: string;
  actor: { prenom: string | null; nom: string | null } | null;
};

/** Notifications de l'utilisateur courant (les plus récentes d'abord). */
export async function listMyNotifications(
  limit = 20,
): Promise<NotificationItem[]> {
  const user = await cachedGetUser();
  if (!user) return [];
  const supabase = await createCrmClient();
  // L'acteur de la notif vit dans `public.users` : PostgREST ne résout pas les
  // embeds cross-schéma, on récupère l'id brut (actor_id) puis on recolle l'info
  // en JS via un fetch groupé sur public.users.
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, contenu, link, lu, created_at, actor_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return []; // dégradation gracieuse (table absente, etc.)
  const rows = (data ?? []) as unknown as (Omit<NotificationItem, 'actor'> & {
    actor_id: string | null;
  })[];
  const users = await fetchCrmUsers(rows.map((r) => r.actor_id));
  return rows.map(({ actor_id, ...r }) => {
    const u = actor_id ? users.get(actor_id) : undefined;
    return { ...r, actor: u ? { prenom: u.prenom, nom: u.nom } : null };
  });
}

/** Nombre de notifications non lues de l'utilisateur courant (badge cloche). */
export async function countMyUnread(): Promise<number> {
  const user = await cachedGetUser();
  if (!user) return 0;
  const supabase = await createCrmClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('lu', false);
  if (error) return 0; // dégradation gracieuse
  return count ?? 0;
}
