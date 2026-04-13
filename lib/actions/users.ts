'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// updateUserRole — admin-only: change a user's role
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'cdp',
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Check caller is admin
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (caller?.role !== 'admin') {
    return { success: false, error: 'Accès refusé — réservé aux admins' };
  }

  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// toggleUserActive — admin-only: enable / disable a user
// ---------------------------------------------------------------------------

export async function toggleUserActive(
  userId: string,
  actif: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Check caller is admin
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (caller?.role !== 'admin') {
    return { success: false, error: 'Accès refusé — réservé aux admins' };
  }

  const { error } = await supabase
    .from('users')
    .update({ actif })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}
