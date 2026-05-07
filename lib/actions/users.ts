'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireSuperAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSuperAdmin } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';

const InviteUserSchema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  role: z.enum(['admin', 'cdp'], 'Role invalide (admin ou cdp)'),
  prenom: z.string().min(1, 'Prenom requis').max(100),
  nom: z.string().min(1, 'Nom requis').max(100),
});

const UpdateUserRoleSchema = z.object({
  userId: z.string().uuid('userId doit etre un UUID'),
  role: z.enum(['admin', 'cdp', 'superadmin'], 'Role invalide'),
});

const UpdateUserProfileSchema = z.object({
  userId: z.string().uuid('userId doit etre un UUID'),
  prenom: z.string().min(1, 'Prenom requis').max(100),
  nom: z.string().min(1, 'Nom requis').max(100),
});

const UserIdSchema = z.string().uuid('userId doit etre un UUID');

// ---------------------------------------------------------------------------
// updateUserRole - change a user's role (with hierarchy guards)
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'cdp' | 'superadmin',
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateUserRoleSchema.safeParse({ userId, role });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  // Cannot change own role
  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre rôle',
    };
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
  if (!isSuperAdmin(callerRole)) {
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

  logAudit('user_role_changed', 'user', userId, { role }, authUser.id);

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
  const parsed = UpdateUserProfileSchema.safeParse({ userId, prenom, nom });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const { error } = await supabase
    .from('users')
    .update({ prenom, nom })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'user_profile_updated',
    'user',
    userId,
    { prenom, nom },
    authUser.id,
  );

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateUserPipelineAccess - admin-only: toggle pipeline access flag
// ---------------------------------------------------------------------------

export async function updateUserPipelineAccess(
  userId: string,
  pipelineAccess: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit etre un UUID' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const { error } = await supabase
    .from('users')
    .update({ pipeline_access: pipelineAccess })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'user_pipeline_access_changed',
    'user',
    userId,
    { pipelineAccess },
    authUser.id,
  );
  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateUserIdeasPermissions - admin-only: toggle validate/ship ideas flags
// ---------------------------------------------------------------------------

export async function updateUserIdeasPermissions(
  userId: string,
  permissions: { canValidateIdeas: boolean; canShipIdeas: boolean },
): Promise<{ success: boolean; error?: string }> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit etre un UUID' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  const { error } = await supabase
    .from('users')
    .update({
      can_validate_ideas: permissions.canValidateIdeas,
      can_ship_ideas: permissions.canShipIdeas,
    })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };

  logAudit(
    'user_ideas_permissions_changed',
    'user',
    userId,
    permissions,
    authUser.id,
  );
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
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit etre un UUID' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre compte',
    };
  }

  // Admin cannot deactivate another admin or superadmin
  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (
    !isSuperAdmin(callerRole) &&
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

  logAudit('user_toggled', 'user', userId, { actif }, authUser.id);

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteUser - superadmin-only: permanently delete a user
// ---------------------------------------------------------------------------

export async function deleteUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit etre un UUID' };
  }

  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser } = auth;

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas supprimer votre propre compte',
    };
  }

  // Get target info for audit (avant suppression cote DB).
  const { data: target } = await supabase
    .from('users')
    .select('email, nom, prenom, role')
    .eq('id', userId)
    .single();

  // 1. Suppression atomique cote DB via RPC delete_user_cascade (sprint 5 #5).
  //    Avant : 7 DELETE/UPDATE sequentiels sans transaction - si l'un cassait
  //    au milieu, on avait un user partiellement supprime (notifs gone mais
  //    public.users intact). La fonction Postgres encapsule tout dans une
  //    transaction implicite plpgsql.
  // Cast: la fonction est ajoutee par la migration 20260507120000_delete_user_cascade.
  // Les types Supabase generes seront a jour apres la prochaine
  // `supabase gen types`. On cast dans l intervalle pour ne pas bloquer.
  const { error: cascadeError } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: { p_user_id: string },
    ) => Promise<{ error: { message: string } | null }>
  )('delete_user_cascade', { p_user_id: userId });
  if (cascadeError) {
    logger.error('actions.users', 'delete_user_cascade RPC failed', {
      userId,
      error: cascadeError,
    });
    return {
      success: false,
      error: `Suppression DB echouee : ${cascadeError.message}`,
    };
  }

  // 2. Suppression de l'auth user. ICI on VERIFIE l erreur (avant : ignoree
  //    silencieusement, donc un auth.users orphelin pouvait empecher la
  //    reinvitation avec le meme email). Procedure de reconciliation manuelle
  //    documentee dans docs/RUNBOOKS.md.
  const adminClient = createAdminClient();
  const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authErr) {
    logger.error('actions.users', 'auth.admin.deleteUser failed', {
      userId,
      authErr,
    });
    return {
      success: false,
      error:
        "Profil supprime mais l'auth Supabase est restee : contactez un superadmin (procedure dans docs/RUNBOOKS.md).",
    };
  }

  logAudit(
    'user_deleted',
    'user',
    userId,
    {
      email: target?.email ?? '',
      nom: target?.nom ?? '',
      prenom: target?.prenom ?? '',
    },
    authUser.id,
  );

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
  const parsed = InviteUserSchema.safeParse({
    email: email?.trim(),
    role,
    prenom: prenom?.trim(),
    nom: nom?.trim(),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  // Readable temp password - user will change it in Mon compte. randomBytes
  // est crypto-secure (vs Math.random predictible si l'attaquant a un autre
  // output du meme process Node).
  const password = `Soluvia-${randomBytes(12).toString('base64url')}`;

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  // Only superadmin can invite admins
  if (role === 'admin' && !isSuperAdmin(callerRole)) {
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
      email: parsed.data.email,
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

  // Send invitation email with temporary password via Resend
  try {
    const { sendInvitationEmail } = await import('@/lib/email/client');
    await sendInvitationEmail({
      to: parsed.data.email,
      inviterName,
      inviteePrenom: parsed.data.prenom,
      role: role === 'admin' ? 'Administrateur' : 'Chef de projet',
      tempPassword: password,
    });
  } catch {
    // Email failed but user was created - admin can share credentials manually
  }

  // Insert the user row with prenom/nom
  const { error: insertError } = await adminClient.from('users').insert({
    id: newUser.user.id,
    email: parsed.data.email,
    nom: parsed.data.nom,
    prenom: parsed.data.prenom,
    role,
    actif: true,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  logAudit(
    'user_invited',
    'user',
    newUser.user.id,
    { email, role },
    authUser.id,
  );

  // Notification fan-out aux admins quand on invite un CDP : ils sauront
  // qu un nouveau collaborateur attend une affectation projet. La notif
  // se resout automatiquement (trigger SQL) quand le user recoit son
  // premier projet client.
  if (role === 'cdp') {
    const { data: adminsRows } = await adminClient
      .from('users')
      .select('id')
      .in('role', ['admin', 'superadmin'])
      .eq('actif', true);

    const admins = adminsRows ?? [];
    if (admins.length > 0) {
      const fullName = `${parsed.data.prenom} ${parsed.data.nom}`.trim();
      const notifs = admins.map((a) => ({
        user_id: a.id,
        subject_user_id: newUser.user.id,
        type: 'collaborateur_a_affecter' as const,
        titre: 'Nouveau collaborateur a affecter',
        message: `${fullName} vient d etre invite et attend une affectation projet.`,
        lien: '/admin/intercontrat',
      }));
      await adminClient.from('notifications').insert(notifs);
    }
  }

  revalidatePath('/admin/utilisateurs');
  return { success: true };
}
