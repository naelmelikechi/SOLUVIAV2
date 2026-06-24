'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth, requireSuperAdmin } from '@/lib/auth/guards';
import {
  canDeleteUser,
  canInviteRole,
  canResetUserCredentials,
} from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { UserIdSchema, type ActionResult } from './shared';

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
