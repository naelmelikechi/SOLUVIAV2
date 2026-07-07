import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type CrmUserLite = { prenom: string; nom: string; email: string };

/** Récupère des users (public.users) par id, en une requête, pour recoller
 *  l'info commercial/owner/assignee (embed cross-schéma impossible). */
export async function fetchCrmUsers(
  ids: ReadonlyArray<string | null | undefined>,
  opts?: { admin?: boolean },
): Promise<Map<string, CrmUserLite>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const sb = opts?.admin ? createAdminClient() : await createClient();
  const { data } = await sb
    .from('users')
    .select('id, prenom, nom, email')
    .in('id', unique);
  return new Map(
    (data ?? []).map((u) => [
      u.id,
      { prenom: u.prenom, nom: u.nom, email: u.email },
    ]),
  );
}
