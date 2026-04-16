import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getUsersList() {
  const supabase = await createClient();

  const [usersResult, projetsResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, nom, prenom, role, actif, derniere_connexion')
      .order('nom'),
    supabase
      .from('projets')
      .select('cdp_id, backup_cdp_id')
      .eq('archive', false),
  ]);

  if (usersResult.error) {
    logger.error('queries.users', 'getUsersList failed', {
      error: usersResult.error,
    });
    throw new AppError(
      'USERS_FETCH_FAILED',
      'Impossible de charger les utilisateurs',
      { cause: usersResult.error },
    );
  }

  // Count projets assigned per user (as cdp or backup_cdp)
  const projetCountMap = new Map<string, number>();
  if (projetsResult.data) {
    for (const projet of projetsResult.data) {
      if (projet.cdp_id) {
        projetCountMap.set(
          projet.cdp_id,
          (projetCountMap.get(projet.cdp_id) ?? 0) + 1,
        );
      }
      if (projet.backup_cdp_id) {
        projetCountMap.set(
          projet.backup_cdp_id,
          (projetCountMap.get(projet.backup_cdp_id) ?? 0) + 1,
        );
      }
    }
  }

  return usersResult.data.map((user) => ({
    ...user,
    projets_count: projetCountMap.get(user.id) ?? 0,
  }));
}

export type UserListItem = Awaited<ReturnType<typeof getUsersList>>[number];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // Full select - requires migrations 00041 (avatar_mode) + 00042 (telephone).
  const full = await supabase
    .from('users')
    .select(
      'id, email, nom, prenom, role, telephone, avatar_mode, avatar_seed, avatar_regen_date',
    )
    .eq('id', authUser.id)
    .single();

  if (full.data) return full.data;

  // Fallback for prod DBs where migrations 00041/00042 haven't been applied yet.
  // Select the columns guaranteed by migrations 00003 + 00038 and fill the
  // missing fields with null so downstream code (which already handles nulls)
  // keeps working.
  const legacy = await supabase
    .from('users')
    .select('id, email, nom, prenom, role, avatar_seed, avatar_regen_date')
    .eq('id', authUser.id)
    .single();

  if (!legacy.data) return null;
  return {
    ...legacy.data,
    telephone: null as string | null,
    avatar_mode: null as 'daily' | 'random' | 'frozen' | null,
  };
}

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof getCurrentUser>>
>;
