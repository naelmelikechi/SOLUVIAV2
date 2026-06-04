'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth, requireSuperAdmin } from '@/lib/auth/guards';
import {
  canAssignRole,
  canDeleteUser,
  canInviteRole,
  canManageUser,
  canResetUserCredentials,
} from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';

type ActionResult = {
  success: boolean;
  error?: string;
  /**
   * Avertissements non-bloquants remontes au caller (ex. email non envoye,
   * notif fan-out KO). L UI peut afficher un toast.warning en plus du
   * toast.success. Avant : ces erreurs etaient silencieusement loguees et
   * l'admin n avait aucun signal.
   */
  warnings?: string[];
};

const InviteUserSchema = z.object({
  // trim + lowercase pour eviter "Foo@BAR.fr" vs "foo@bar.fr" qui crashent
  // sur la contrainte UNIQUE (case-sensitive cote Postgres).
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse email invalide')
    .max(254),
  role: z.enum(['admin', 'cdp', 'commercial'], 'Rôle invalide'),
  prenom: z.string().min(1, 'Prénom requis').max(100),
  nom: z.string().min(1, 'Nom requis').max(100),
});

const UpdateUserRoleSchema = z.object({
  userId: z.string().uuid('userId doit être un UUID'),
  role: z.enum(['admin', 'cdp', 'superadmin', 'commercial'], 'Rôle invalide'),
});

const UpdateUserProfileSchema = z.object({
  userId: z.string().uuid('userId doit être un UUID'),
  prenom: z.string().min(1, 'Prénom requis').max(100),
  nom: z.string().min(1, 'Nom requis').max(100),
});

const UserIdSchema = z.string().uuid('userId doit être un UUID');

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

function generateTempPassword(): string {
  // randomBytes est crypto-secure (vs Math.random predictible si l'attaquant
  // a un autre output du meme process Node).
  return `Soluvia-${randomBytes(12).toString('base64url')}`;
}

/**
 * Retry exponentiel pour les operations Supabase Auth qui peuvent fail
 * temporairement (rate-limit, blip reseau). N est pas une fortification de
 * securite - juste une amelioration UX.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = baseMs * Math.pow(3, i);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// updateUserRole - change a user's role (with hierarchy guards)
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'cdp' | 'superadmin' | 'commercial',
): Promise<ActionResult> {
  const parsed = UpdateUserRoleSchema.safeParse({ userId, role });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre rôle',
    };
  }

  if (!canAssignRole(callerRole, role)) {
    return {
      success: false,
      error: 'Seul un superadmin peut attribuer ce rôle',
    };
  }

  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (!canManageUser(callerRole, target?.role)) {
    return {
      success: false,
      error: 'Seul un superadmin peut modifier un administrateur',
    };
  }

  // Si on bascule vers commercial, on garantit l acces pipeline (un commercial
  // sans pipeline est inutilisable - le pipeline est SA raison d etre).
  const updates: { role: typeof role; pipeline_access?: boolean } = { role };
  if (role === 'commercial') updates.pipeline_access = true;

  const { error } = await supabase
    .from('users')
    .update(updates)
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
): Promise<ActionResult> {
  const parsed = UpdateUserProfileSchema.safeParse({ userId, prenom, nom });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
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
): Promise<ActionResult> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit être un UUID' };
  }

  const auth = await checkAuth();
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
): Promise<ActionResult> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit être un UUID' };
  }

  const auth = await checkAuth();
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
): Promise<ActionResult> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit être un UUID' };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas modifier votre propre compte',
    };
  }

  const { data: target } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (!canManageUser(callerRole, target?.role)) {
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

  const warnings: string[] = [];

  // Si on passe a inactif, revoque immediatement les sessions actives. Avec
  // retry exponentiel (3 tentatives) car un blip reseau ne doit pas laisser
  // un user desactive connecte jusqu a expiration du JWT (~1h). Si tout fail,
  // on warn le caller mais on ne fail pas l action - le proxy.ts re-check
  // users.actif a chaque refresh de session (5 min max).
  if (!actif) {
    try {
      const adminClient = createAdminClient();
      await withRetry(() => adminClient.auth.admin.signOut(userId, 'global'));
    } catch (err) {
      logger.warn('actions.users', 'signOut global failed apres retry', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      warnings.push(
        'Le compte a ete desactive mais sa session actuelle pourrait persister jusqu a 5 minutes.',
      );
    }
  }

  logAudit('user_toggled', 'user', userId, { actif }, authUser.id);

  revalidatePath('/admin/utilisateurs');
  return warnings.length > 0 ? { success: true, warnings } : { success: true };
}

// ---------------------------------------------------------------------------
// deleteUser - superadmin-only: permanently delete a user
// ---------------------------------------------------------------------------

export async function deleteUser(userId: string): Promise<ActionResult> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit être un UUID' };
  }

  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (!canDeleteUser(callerRole)) {
    return { success: false, error: 'Accès refusé' };
  }

  if (authUser.id === userId) {
    return {
      success: false,
      error: 'Vous ne pouvez pas supprimer votre propre compte',
    };
  }

  const { data: target } = await supabase
    .from('users')
    .select('email, nom, prenom, role')
    .eq('id', userId)
    .single();

  // Suppression atomique cote DB (transaction plpgsql).
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await
  const { error: cascadeError } = await supabase.rpc('delete_user_cascade', {
    p_user_id: userId,
  });
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

  // Suppression auth.users : si fail, profil deja parti -> orphelin bloquant
  // une re-invitation avec le meme email. Le CRON cleanup-auth-orphans le
  // recuperera mais on remonte au caller pour traitement immediat.
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
        "Profil supprimé mais l'auth Supabase est restée : contactez un superadmin (procédure dans docs/RUNBOOKS.md).",
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
  role: 'admin' | 'cdp' | 'commercial',
  prenom?: string,
  nom?: string,
): Promise<ActionResult> {
  const parsed = InviteUserSchema.safeParse({
    email: email?.trim(),
    role,
    prenom: prenom?.trim(),
    nom: nom?.trim(),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const password = generateTempPassword();

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (!canInviteRole(callerRole, parsed.data.role)) {
    return {
      success: false,
      error: 'Seul un superadmin peut inviter un administrateur',
    };
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return {
      success: false,
      error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)',
    };
  }

  // Pre-check duplicate dans public.users (case-insensitive grace au lowercase
  // applique par le schema zod). Avant : on filait directement a createUser
  // qui retournait un message Supabase peu explicite ("User already registered")
  // et laissait l user dans le doute sur le statut existant.
  const { data: existing } = await adminClient
    .from('users')
    .select('id, actif')
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (existing) {
    return {
      success: false,
      error: existing.actif
        ? 'Un utilisateur avec cet email existe déjà'
        : 'Cet email existe mais le compte est désactivé. Réactivez-le plutôt que de réinviter.',
    };
  }

  const { data: inviter } = await supabase
    .from('users')
    .select('prenom, nom')
    .eq('id', authUser.id)
    .single();
  const inviterName = inviter
    ? `${inviter.prenom} ${inviter.nom}`.trim()
    : 'Un administrateur';

  const { data: newUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password,
      email_confirm: true,
      user_metadata: { role: parsed.data.role },
    });

  if (createError) {
    return { success: false, error: createError.message };
  }

  if (!newUser.user) {
    return { success: false, error: 'Erreur inattendue lors de la création' };
  }

  const warnings: string[] = [];

  // Envoi email d invitation. Si fail : on log + on retient un warning, mais
  // on continue (l admin peut transmettre le tempPassword manuellement).
  try {
    const { sendInvitationEmail } = await import('@/lib/email/client');
    const result = await sendInvitationEmail({
      to: parsed.data.email,
      inviterName,
      inviteePrenom: parsed.data.prenom,
      role:
        parsed.data.role === 'admin'
          ? 'Administrateur'
          : parsed.data.role === 'commercial'
            ? 'Commercial'
            : 'Chef de projet',
      tempPassword: password,
    });
    if (!result.success) {
      logger.error('actions.users', 'invitation email send failed', {
        to: parsed.data.email,
        error: result.error,
      });
      warnings.push(
        "L'invitation a été créée mais l'email n'a pas été envoyé. Transmettez le mot de passe temporaire manuellement.",
      );
    }
  } catch (err) {
    logger.error('actions.users', 'invitation email threw', {
      to: parsed.data.email,
      error: err instanceof Error ? err.message : String(err),
    });
    warnings.push(
      "L'invitation a été créée mais l'email n'a pas pu être envoyé.",
    );
  }

  // Pour les commerciaux, on force pipeline_access=true (sans ca, le user
  // verrait le menu pipeline mais aurait 403 sur chaque action - bug perçu).
  const { error: insertError } = await adminClient.from('users').insert({
    id: newUser.user.id,
    email: parsed.data.email,
    nom: parsed.data.nom,
    prenom: parsed.data.prenom,
    role: parsed.data.role,
    actif: true,
    pipeline_access: parsed.data.role === 'commercial' ? true : false,
  });

  if (insertError) {
    // Rollback : auth.user deja cree mais INSERT public.users a fail.
    // Sans cleanup -> orphelin qui bloque toute re-invitation avec le meme email.
    const rollback = await adminClient.auth.admin.deleteUser(newUser.user.id);
    if (rollback.error) {
      logger.error('actions.users', 'inviteUser rollback failed', {
        userId: newUser.user.id,
        insertError: insertError.message,
        rollbackError: rollback.error.message,
      });
      return {
        success: false,
        error: `Création échouée et nettoyage incomplet (orphelin auth.users à supprimer manuellement, voir docs/RUNBOOKS.md) : ${insertError.message}`,
      };
    }
    return { success: false, error: insertError.message };
  }

  // Envoi du welcome email (presentation outil par role). Independant de
  // l invitation (credentials) envoyee plus haut. Best-effort : si fail,
  // on log + on retient un warning, mais on continue (l outil reste utilisable
  // meme sans le welcome).
  try {
    const { sendWelcomeEmail } = await import('@/lib/email/welcome');
    const welcomeResult = await sendWelcomeEmail({
      email: parsed.data.email,
      prenom: parsed.data.prenom,
      role: parsed.data.role,
    });
    if (welcomeResult.success) {
      const { error: stampErr } = await adminClient
        .from('users')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('id', newUser.user.id);
      if (stampErr) {
        logger.warn('actions.users', 'welcome stamp failed', {
          userId: newUser.user.id,
          error: stampErr.message,
        });
      }
    } else {
      logger.warn('actions.users', 'welcome email send failed', {
        to: parsed.data.email,
        error: welcomeResult.error,
      });
    }
  } catch (err) {
    logger.error('actions.users', 'welcome email threw', {
      to: parsed.data.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logAudit(
    'user_invited',
    'user',
    newUser.user.id,
    { email: parsed.data.email, role: parsed.data.role },
    authUser.id,
  );

  // Fan-out notifs aux admins quand on invite un CDP. Si fail : warning UI.
  if (parsed.data.role === 'cdp') {
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
        titre: 'Nouveau collaborateur à affecter',
        message: `${fullName} vient d'être invité et attend une affectation projet.`,
        lien: '/admin/intercontrat',
      }));
      const { error: notifsError } = await adminClient
        .from('notifications')
        .insert(notifs);
      if (notifsError) {
        logger.warn('actions.users', 'invite cdp notifs failed', {
          newUserId: newUser.user.id,
          adminsCount: admins.length,
          error: notifsError,
        });
        warnings.push(
          "Les autres admins n'ont pas reçu de notification (ils verront le collaborateur dans /admin/intercontrat).",
        );
      }
    }
  }

  revalidatePath('/admin/utilisateurs');
  return warnings.length > 0 ? { success: true, warnings } : { success: true };
}

// ---------------------------------------------------------------------------
// resetUserPassword - admin-only: regenere un mot de passe temporaire et
// renvoie un email a l user (sert a la fois pour "renvoyer l invitation"
// et "reset password admin" - meme mecanisme, le wording de l email s adapte).
// ---------------------------------------------------------------------------

export async function resetUserPassword(userId: string): Promise<ActionResult> {
  if (!UserIdSchema.safeParse(userId).success) {
    return { success: false, error: 'userId doit être un UUID' };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user: authUser, role: callerRole } = auth;

  if (authUser.id === userId) {
    return {
      success: false,
      error:
        'Vous ne pouvez pas réinitialiser votre propre mot de passe ici (utilisez Mot de passe oublié).',
    };
  }

  const { data: target } = await supabase
    .from('users')
    .select('email, prenom, nom, role, derniere_connexion')
    .eq('id', userId)
    .single();
  if (!target) {
    return { success: false, error: 'Utilisateur introuvable' };
  }

  if (!canResetUserCredentials(callerRole, target.role)) {
    return {
      success: false,
      error:
        "Seul un superadmin peut réinitialiser le mot de passe d'un administrateur",
    };
  }

  const adminClient = createAdminClient();
  const password = generateTempPassword();

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(
    userId,
    { password },
  );
  if (updateErr) {
    logger.error('actions.users', 'updateUserById password failed', {
      userId,
      error: updateErr.message,
    });
    return { success: false, error: updateErr.message };
  }

  const { data: inviter } = await supabase
    .from('users')
    .select('prenom, nom')
    .eq('id', authUser.id)
    .single();
  const inviterName = inviter
    ? `${inviter.prenom} ${inviter.nom}`.trim()
    : 'Un administrateur';

  // 'invite' si l user n a jamais ouvert son compte, 'reset' sinon.
  // Le template adapte greeting + subject (cf. lib/email/client.ts).
  const kind: 'invite' | 'reset' = target.derniere_connexion
    ? 'reset'
    : 'invite';
  const warnings: string[] = [];

  try {
    const { sendInvitationEmail } = await import('@/lib/email/client');
    const result = await sendInvitationEmail({
      to: target.email,
      inviterName,
      inviteePrenom: target.prenom,
      role:
        target.role === 'admin'
          ? 'Administrateur'
          : target.role === 'commercial'
            ? 'Commercial'
            : target.role === 'superadmin'
              ? 'Superadmin'
              : 'Chef de projet',
      tempPassword: password,
      kind,
    });
    if (!result.success) {
      logger.error('actions.users', 'reset email send failed', {
        to: target.email,
        error: result.error,
      });
      warnings.push(
        "Mot de passe réinitialisé mais l'email n'a pas été envoyé. Transmettez-le manuellement.",
      );
    }
  } catch (err) {
    logger.error('actions.users', 'reset email threw', {
      to: target.email,
      error: err instanceof Error ? err.message : String(err),
    });
    warnings.push(
      "Mot de passe réinitialisé mais l'email n'a pas pu être envoyé.",
    );
  }

  logAudit(
    kind === 'reset' ? 'user_password_reset' : 'user_reinvited',
    'user',
    userId,
    { email: target.email },
    authUser.id,
  );

  revalidatePath('/admin/utilisateurs');
  return warnings.length > 0 ? { success: true, warnings } : { success: true };
}
