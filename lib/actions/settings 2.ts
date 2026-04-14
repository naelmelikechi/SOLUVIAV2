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
