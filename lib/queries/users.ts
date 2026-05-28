import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getUsersList() {
  const supabase = await createClient();

  const [usersResult, projetsResult] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, email, nom, prenom, role, actif, derniere_connexion, pipeline_access, can_validate_ideas, can_ship_ideas',
      )
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

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select(
      'id, email, nom, prenom, role, actif, telephone, avatar_mode, avatar_seed, avatar_regen_date, pipeline_access, can_validate_ideas, can_ship_ideas, onboarding_completed_at',
    )
    .eq('id', authUser.id)
    .single();

  if (!data) return null;

  // users.avatar_mode is TEXT in the DB (no enum). Supabase types it as
  // `string | null`; downstream code assumes the narrow union from avatar.ts.
  return {
    ...data,
    actif: data.actif ?? false,
    avatar_mode: data.avatar_mode as 'daily' | 'random' | 'frozen' | null,
    pipeline_access: data.pipeline_access ?? false,
    can_validate_ideas: data.can_validate_ideas ?? false,
    can_ship_ideas: data.can_ship_ideas ?? false,
  };
}

/**
 * Compte les projets clients (non internes) ou l user est cdp ou backup_cdp.
 * Sert a deriver le statut "unassigned_collaborator" dans le layout dashboard.
 */
export async function getCurrentUserActiveProjetsCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('projets')
    .select('id', { count: 'exact', head: true })
    .eq('archive', false)
    .eq('est_interne', false)
    .or(`cdp_id.eq.${user.id},backup_cdp_id.eq.${user.id}`);
  return count ?? 0;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function getActiveUsersMinimal() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, nom, prenom')
    .eq('actif', true)
    .order('nom');

  if (error) {
    logger.error('queries.users', 'getActiveUsersMinimal failed', { error });
    throw new AppError(
      'USERS_FETCH_FAILED',
      'Impossible de charger les utilisateurs actifs',
      { cause: error },
    );
  }
  return data;
}

export type ActiveUserMinimal = Awaited<
  ReturnType<typeof getActiveUsersMinimal>
>[number];
