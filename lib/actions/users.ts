'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin, isSuperAdmin } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// updateUserRole - change a user's role (with hierarchy guards)
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
    return { success: false, error: 'Accès refusé - réservé aux admins' };
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

  logAudit('user_role_changed', 'user', userId, { role });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateUserProfile - admin-only: change a user's prenom/nom
// ---------------------------------------------------------------------------

export async function updateUserProfile(
  userId: string,
  prenom: string,
  nom: string,
): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: 'Accès refusé - réservé aux admins' };
  }

  const { error } = await supabase
    .from('users')
    .update({ prenom, nom })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  logAudit('user_profile_updated', 'user', userId, { prenom, nom });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// toggleUserActive - admin-only: enable / disable a user
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
    return { success: false, error: 'Accès refusé - réservé aux admins' };
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

  logAudit('user_toggled', 'user', userId, { actif });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteUser - superadmin-only: permanently delete a user
// ---------------------------------------------------------------------------

export async function deleteUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas supprimer votre propre compte',
    };
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single();
  if (!isSuperAdmin(caller?.role)) {
    return {
      success: false,
      error: 'Seul un superadmin peut supprimer un utilisateur',
    };
  }

  // Get target info for audit
  const { data: target } = await supabase
    .from('users')
    .select('email, nom, prenom, role')
    .eq('id', userId)
    .single();

  // Nullify foreign keys referencing this user
  const adminClient = createAdminClient();
  await supabase.from('notifications').delete().eq('user_id', userId);
  await supabase.from('saisies_temps').delete().eq('user_id', userId);
  await supabase.from('client_notes').delete().eq('user_id', userId);
  await supabase.from('projets').update({ cdp_id: null }).eq('cdp_id', userId);
  await supabase
    .from('projets')
    .update({ backup_cdp_id: null })
    .eq('backup_cdp_id', userId);
  await supabase
    .from('factures')
    .update({ created_by: null })
    .eq('created_by', userId);
  await supabase
    .from('parametres')
    .update({ updated_by: null })
    .eq('updated_by', userId);

  // Delete from public.users
  const { error: deleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Delete from auth.users
  await adminClient.auth.admin.deleteUser(userId);

  logAudit('user_deleted', 'user', userId, {
    email: target?.email ?? '',
    nom: target?.nom ?? '',
    prenom: target?.prenom ?? '',
  });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// inviteUser - admin-only: invite a new user by email
// ---------------------------------------------------------------------------

export async function inviteUser(
  email: string,
  role: 'admin' | 'cdp',
  prenom?: string,
  nom?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!email?.trim()) {
    return { success: false, error: "L'adresse email est requise" };
  }

  if (!prenom?.trim() || !nom?.trim()) {
    return { success: false, error: 'Le prénom et le nom sont requis' };
  }

  // Random temp password (user will set their own via the recovery link)
  const password = `Tmp-${crypto.randomUUID()}`;

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
    return { success: false, error: 'Accès refusé - réservé aux admins' };
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

  // Get inviter's name for the email
  const { data: inviter } = await supabase
    .from('users')
    .select('prenom, nom')
    .eq('id', authUser.id)
    .single();
  const inviterName = inviter
    ? `${inviter.prenom} ${inviter.nom}`.trim()
    : 'Un administrateur';

  // Create user with password (no magic link needed)
  const { data: newUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { role },
    });

  if (createError) {
    return { success: false, error: createError.message };
  }

  if (!newUser.user) {
    return { success: false, error: 'Erreur inattendue lors de la création' };
  }

  // Generate a password reset link so the user can set their own password
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim(),
    options: {
      redirectTo: 'https://soluvia.vercel.app/set-password',
    },
  });

  // Fix the link if Supabase still uses localhost as base
  let setupLink = linkData?.properties?.action_link ?? '';
  if (setupLink.includes('localhost:3000')) {
    setupLink = setupLink.replace(
      'http://localhost:3000',
      'https://soluvia.vercel.app',
    );
  }
  // Ensure redirect_to points to set-password
  if (setupLink && !setupLink.includes('set-password')) {
    const url = new URL(setupLink);
    url.searchParams.set(
      'redirect_to',
      'https://soluvia.vercel.app/set-password',
    );
    setupLink = url.toString();
  }

  // Send invitation email via Resend
  try {
    const { sendInvitationEmail } = await import('@/lib/email/client');
    await sendInvitationEmail({
      to: email.trim(),
      inviterName,
      inviteePrenom: prenom!.trim(),
      role: role === 'admin' ? 'Administrateur' : 'Chef de projet',
      link: setupLink ?? 'https://soluvia.vercel.app/login',
    });
  } catch {
    // Email failed but user was created
  }

  // Insert the user row with prenom/nom
  const { error: insertError } = await adminClient.from('users').insert({
    id: newUser.user.id,
    email: email.trim(),
    nom: nom!.trim(),
    prenom: prenom!.trim(),
    role,
    actif: true,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  logAudit('user_invited', 'user', newUser.user.id, { email, role });

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}
