import { createClient } from '@/lib/supabase/server';

export async function getUsersList() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, nom, prenom, role, actif, derniere_connexion')
    .order('nom');

  if (error) throw error;
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
