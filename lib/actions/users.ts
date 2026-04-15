'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin, isSuperAdmin } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// updateUserRole — change a user's role (with hierarchy guards)
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'cdp' | 'superadmin',
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  // Cannot change own role
  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre rôle',
    };
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (!isAdmin(caller?.role)) {
    return { success: false, error: 'Accès refusé — réservé aux admins' };
  }

  // Fetch target user's current role
  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  // Hierarchy guards:
  // - Only superadmin can assign 'superadmin' or 'admin' roles
  // - Only superadmin can modify another admin or superadmin
  // - Admin can only manage CDPs
  if (!isSuperAdmin(caller?.role)) {
    if (role === 'superadmin' || role === 'admin') {
      return {
        success: false,
        error: 'Seul un superadmin peut attribuer ce rôle',
      };
    }
    if (target?.role === 'admin' || target?.role === 'superadmin') {
      return {
        success: false,
        error: 'Seul un superadmin peut modifier un administrateur',
      };
    }
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

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre compte',
    };
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (!isAdmin(caller?.role)) {
    return { success: false, error: 'Accès refusé — réservé aux admins' };
  }

  // Admin cannot deactivate another admin or superadmin
  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (
    !isSuperAdmin(caller?.role) &&
    (target?.role === 'admin' || target?.role === 'superadmin')
  ) {
    return {
      success: false,
      error: 'Seul un superadmin peut modifier un administrateur',
    };
  }

  const { error } = await supabase
    .from('users')
    .update({ actif })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// inviteUser — admin-only: invite a new user by email
// ---------------------------------------------------------------------------

export async function inviteUser(
  email: string,
  role: 'admin' | 'cdp',
): Promise<{ success: boolean; error?: string }> {
  if (!email?.trim()) {
    return { success: false, error: "L'adresse email est requise" };
  }

  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (!isAdmin(caller?.role)) {
    return { success: false, error: 'Accès refusé — réservé aux admins' };
  }

  // Only superadmin can invite admins
  if (role === 'admin' && !isSuperAdmin(caller?.role)) {
    return {
      success: false,
      error: 'Seul un superadmin peut inviter un administrateur',
    };
  }

  // Use admin client for auth operations (requires SUPABASE_SERVICE_ROLE_KEY)
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return {
      success: false,
      error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)',
    };
  }

  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
      data: { role },
    });

  if (inviteError) {
    return { success: false, error: inviteError.message };
  }

  if (!inviteData.user) {
    return { success: false, error: "Erreur inattendue lors de l'invitation" };
  }

  // Insert the user row so they appear in the users table immediately
  // nom/prenom will be updated when the user accepts the invite and completes their profile
  const { error: insertError } = await adminClient.from('users').insert({
    id: inviteData.user.id,
    email: email.trim(),
    nom: '',
    prenom: '',
    role,
    actif: true,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  logAudit('user_invited', 'user', inviteData.user.id, { email, role });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}
