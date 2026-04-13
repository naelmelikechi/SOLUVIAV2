import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getUsersList() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, nom, prenom, role, actif, derniere_connexion')
    .order('nom');

  if (error) {
    logger.error('queries.users', 'getUsersList failed', { error });
    throw new AppError(
      'USERS_FETCH_FAILED',
      'Impossible de charger les utilisateurs',
      { cause: error },
    );
  }
  return data;
}

export type UserListItem = Awaited<ReturnType<typeof getUsersList>>[number];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('id, email, nom, prenom, role')
    .eq('id', authUser.id)
    .single();

  return data;
}

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof getCurrentUser>>
>;
