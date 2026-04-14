'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// updateProfile — update current user's prenom and nom
// ---------------------------------------------------------------------------

export async function updateProfile(
  prenom: string,
  nom: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifie' };

  const { error } = await supabase
    .from('users')
    .update({ prenom, nom })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/parametres-compte');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updatePassword — change current user's password via Supabase Auth
// ---------------------------------------------------------------------------

export async function updatePassword(
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifie' };

  if (newPassword.length < 8) {
    return {
      success: false,
      error: 'Le mot de passe doit contenir au moins 8 caracteres',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { success: false, error: error.message };

  return { success: true };
}

// ---------------------------------------------------------------------------
// Avatar actions
// ---------------------------------------------------------------------------

/** Generate a new random robot and lock it */
export async function regenerateAvatar(): Promise<{
  success: boolean;
  seed?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const seed = `${authUser.email}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { error } = await supabase
    .from('users')
    .update({ avatar_seed: seed })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/parametres-compte');
  return { success: true, seed };
}

/** Lock the current daily avatar so it never changes */
export async function lockAvatar(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const d = new Date();
  const seed = `${authUser.email}${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const { error } = await supabase
    .from('users')
    .update({ avatar_seed: seed })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/parametres-compte');
  return { success: true };
}

/** Unlock avatar — go back to daily rotation */
export async function unlockAvatar(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { error } = await supabase
    .from('users')
    .update({ avatar_seed: null })
    .eq('id', authUser.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/parametres-compte');
  return { success: true };
}
