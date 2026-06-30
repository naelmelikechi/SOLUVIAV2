import type { SupabaseServerClient } from '@/lib/actions/factures/brouillons-shared';

// Wrapper fin sur la RPC get_or_create_projet_libre (source unique cote SQL).
// Find-or-create idempotent : renvoie l'id du projet libre du client, en le
// creant a la volee si absent. La concurrence est geree en base (index unique
// partiel + ON CONFLICT). Admin-only : l'INSERT cote SQL est soumis a la RLS
// projets_admin_insert.
export async function getOrCreateProjetLibre(
  supabase: SupabaseServerClient,
  clientId: string,
): Promise<{ ok: true; projetId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_or_create_projet_libre', {
    p_client_id: clientId,
  });
  if (error || data == null) {
    return {
      ok: false,
      error: error?.message ?? 'Projet libre indisponible',
    };
  }
  return { ok: true, projetId: data as string };
}
