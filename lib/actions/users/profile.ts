'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { canAssignRole, canManageUser } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { UserIdSchema, type ActionResult } from './shared';

const UpdateUserRoleSchema = z.object({
  userId: z.string().uuid('userId doit être un UUID'),
  role: z.enum(['admin', 'cdp', 'superadmin', 'commercial'], 'Rôle invalide'),
});

const UpdateUserProfileSchema = z.object({
  userId: z.string().uuid('userId doit être un UUID'),
  prenom: z.string().min(1, 'Prénom requis').max(100),
  nom: z.string().min(1, 'Nom requis').max(100),
});

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
