/**
 * Guards reutilisables pour les Server Actions et routes API.
 *
 * Avant : chaque action repetait le bloc createClient + auth.getUser +
 * if !user return { success: false, error: 'Non authentifié' } (~150 occurrences
 * dans lib/actions/*.ts). Le risque : un oubli sur une nouvelle action ne
 * leve aucune erreur, l'autorisation est silencieusement contournee.
 *
 * Apres : un appel a requireAuth() ou checkAuth() en haut de l'action.
 *
 * Pattern d'utilisation :
 *   const auth = await requireAuth();
 *   if (!auth.ok) return { success: false, error: auth.error };
 *   const { supabase, user } = auth;
 *
 *   const auth = await checkAuth();
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
 * Resout supabase + auth.user + profil public.users (role+actif) en une
 * passe. Utilise en interne par les 3 guards pour eviter 2 round-trips
 * (avant : checkAuth appelait requireAuth, qui fetch actif, puis fetch
 * role - deux SELECT separes).
 */
async function loadAuthProfile(): Promise<
  | {
      ok: true;
      supabase: SupabaseServerClient;
      user: User;
      profile: { role: string; actif: boolean };
    }
  | AuthErr
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Non authentifié' };
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role, actif')
    .eq('id', user.id)
    .single();
  // Profil public.users absent (auth orphelin pendant une reconciliation
  // manuelle) ou actif=false : on refuse.
  if (!profile || profile.actif === false) {
    return { ok: false, error: 'Compte désactivé' };
  }
  return {
    ok: true,
    supabase,
    user,
    profile: { role: profile.role, actif: profile.actif },
  };
}

/**
 * Verifie qu'un user est authentifie ET actif. Retourne { supabase, user } ou
 * { ok: false, error } pretent a etre relayes au client.
 *
 * Le check `actif` ferme la faille : avant, un user desactive via le dialog
 * admin (users.actif = false) restait reconnu par toutes les Server Actions
 * jusqu a expiration de sa session Supabase. Maintenant tout passage par un
 * guard rejette immediatement.
 */
export async function requireAuth(): Promise<BaseAuthOk | AuthErr> {
  const auth = await loadAuthProfile();
  if (!auth.ok) return auth;
  return { ok: true, supabase: auth.supabase, user: auth.user };
}

/**
 * Verifie que l'user est admin ou superadmin (via isAdmin). Charge le role
 * en DB. Retourne { supabase, user, role } ou { ok: false, error }.
 */
export async function checkAuth(): Promise<AuthOk<{ role: string }> | AuthErr> {
  const auth = await loadAuthProfile();
  if (!auth.ok) return auth;
  if (!isAdmin(auth.profile.role)) {
    return { ok: false, error: 'Accès refusé - réservé aux admins' };
  }
  return {
    ok: true,
    supabase: auth.supabase,
    user: auth.user,
    role: auth.profile.role,
  };
}

/**
 * Verifie que l'user est superadmin. Retourne { supabase, user, role } ou
 * { ok: false, error }.
 */
export async function validateSession(): Promise<
  AuthOk<{ role: string }> | AuthErr
> {
  const auth = await loadAuthProfile();
  if (!auth.ok) return auth;
  if (!isSuperAdmin(auth.profile.role)) {
    return { ok: false, error: 'Accès refusé - réservé aux superadmins' };
  }
  return {
    ok: true,
    supabase: auth.supabase,
    user: auth.user,
    role: auth.profile.role,
  };
}
