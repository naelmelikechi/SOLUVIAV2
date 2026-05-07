/**
 * Guards reutilisables pour les Server Actions et routes API.
 *
 * Avant : chaque action repetait le bloc createClient + auth.getUser +
 * if !user return { success: false, error: 'Non authentifié' } (~150 occurrences
 * dans lib/actions/*.ts). Le risque : un oubli sur une nouvelle action ne
 * leve aucune erreur, l'autorisation est silencieusement contournee.
 *
 * Apres : un appel a requireUser() ou requireAdmin() en haut de l'action.
 *
 * Pattern d'utilisation :
 *   const auth = await requireUser();
 *   if (!auth.ok) return { success: false, error: auth.error };
 *   const { supabase, user } = auth;
 *
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return { success: false, error: auth.error };
 *   const { supabase, user, role } = auth;
 */

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, isSuperAdmin } from '@/lib/utils/roles';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type BaseAuthOk = {
  ok: true;
  supabase: SupabaseServerClient;
  user: User;
};

export type AuthOk<E = unknown> = BaseAuthOk & E;

export type AuthErr = {
  ok: false;
  error: string;
};

/**
 * Verifie qu'un user est authentifie. Retourne { supabase, user } ou
 * { ok: false, error } pretent a etre relayes au client.
 */
export async function requireUser(): Promise<BaseAuthOk | AuthErr> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Non authentifié' };
  }
  return { ok: true, supabase, user };
}

/**
 * Verifie que l'user est admin ou superadmin (via isAdmin). Charge le role
 * en DB. Retourne { supabase, user, role } ou { ok: false, error }.
 */
export async function requireAdmin(): Promise<
  AuthOk<{ role: string }> | AuthErr
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isAdmin(caller?.role)) {
    return { ok: false, error: 'Accès refusé - réservé aux admins' };
  }
  return { ok: true, supabase, user, role: caller!.role };
}

/**
 * Verifie que l'user est superadmin. Retourne { supabase, user, role } ou
 * { ok: false, error }.
 */
export async function requireSuperAdmin(): Promise<
  AuthOk<{ role: string }> | AuthErr
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isSuperAdmin(caller?.role)) {
    return { ok: false, error: 'Accès refusé - réservé aux superadmins' };
  }
  return { ok: true, supabase, user, role: caller!.role };
}
