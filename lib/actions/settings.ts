'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/utils/audit';
import {
  dailySeed,
  resolveAvatarSeed,
  todayIso,
  type AvatarMode,
} from '@/lib/utils/avatar';

// ---------------------------------------------------------------------------
// updateProfile - update current user's prenom and nom
// ---------------------------------------------------------------------------

export async function updateProfile(
  prenom: string,
  nom: string,
  telephone: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  // Normalize: empty string → null (DB column is nullable).
  const tel = telephone?.trim() ? telephone.trim() : null;

  const { error } = await supabase
    .from('users')
    .update({ prenom, nom, telephone: tel })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('profile_updated', 'user', undefined, {
    prenom,
    nom,
    telephone: tel,
  });

  revalidatePath('/parametres-compte');
  revalidatePath('/equipe');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updatePassword - change current user's password via Supabase Auth
// ---------------------------------------------------------------------------

export async function updatePassword(
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  if (newPassword.length < 8) {
    return {
      success: false,
      error: 'Le mot de passe doit contenir au moins 8 caractères',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { success: false, error: error.message };

  logAudit('password_changed', 'user');

  return { success: true };
}

// ---------------------------------------------------------------------------
// Avatar actions - modèle à 3 états (daily / random / frozen)
//
// État DB            avatar_mode  avatar_seed        avatar_regen_date
// ─────────────────  ───────────  ─────────────────  ─────────────────
// Quotidien          'daily'      (ignoré)           (persiste, rate-limit)
// Random du jour     'random'     <seed random>      <today>
// Figé               'frozen'     <seed figé>        (ignoré)
//
// Le random expire automatiquement au changement de jour via `resolveAvatarSeed`
// (redevient daily à l'affichage sans toucher à la DB).
// ---------------------------------------------------------------------------

type AvatarActionResult = {
  success: boolean;
  mode?: AvatarMode;
  seed?: string | null;
  regenDate?: string | null;
  error?: string;
};

/** Passe en mode quotidien. Le seed random éventuel est gardé en DB mais ignoré. */
export async function setAvatarDaily(): Promise<AvatarActionResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { error } = await supabase
    .from('users')
    .update({ avatar_mode: 'daily', avatar_seed: null })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('avatar_mode_changed', 'user', undefined, { mode: 'daily' });

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'daily', seed: null };
}

/** Tire un nouveau random. Rate-limit 1/jour (via avatar_regen_date). */
export async function rollRandomAvatar(): Promise<AvatarActionResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { data: userData } = await supabase
    .from('users')
    .select('avatar_regen_date')
    .eq('id', authUser.id)
    .single();

  const today = todayIso();
  if (userData?.avatar_regen_date === today) {
    return {
      success: false,
      error: "Vous avez déjà tiré un robot aujourd'hui. Revenez demain !",
    };
  }

  const seed = `${authUser.email}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { error } = await supabase
    .from('users')
    .update({
      avatar_mode: 'random',
      avatar_seed: seed,
      avatar_regen_date: today,
    })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('avatar_random_rolled', 'user', undefined, { seed });

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'random', seed, regenDate: today };
}

/**
 * Fige l'avatar actuellement visible (celui du jour si daily, le random si random).
 * Idempotent si déjà figé.
 */
export async function freezeCurrentAvatar(): Promise<AvatarActionResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser || !authUser.email)
    return { success: false, error: 'Non authentifié' };

  const { data: userData } = await supabase
    .from('users')
    .select('avatar_mode, avatar_seed, avatar_regen_date')
    .eq('id', authUser.id)
    .single();

  // Résout le seed actuellement affiché (gère l'expiry du random).
  const { seed } = resolveAvatarSeed({
    email: authUser.email,
    mode: (userData?.avatar_mode as AvatarMode | null) ?? 'daily',
    seed: userData?.avatar_seed ?? null,
    regenDate: userData?.avatar_regen_date ?? null,
  });

  // Si le seed résolu est identique à un daily seed frais, on fige quand même
  // avec ce seed précis pour que l'avatar reste constant.
  const seedToFreeze = seed ?? dailySeed(authUser.email);

  const { error } = await supabase
    .from('users')
    .update({ avatar_mode: 'frozen', avatar_seed: seedToFreeze })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  logAudit('avatar_frozen', 'user', undefined, { seed: seedToFreeze });

  revalidatePath('/parametres-compte');
  return { success: true, mode: 'frozen', seed: seedToFreeze };
}
