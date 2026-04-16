import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { AvatarMode } from '@/lib/utils/avatar';

export interface TeamMessage {
  id: string;
  user_id: string;
  contenu: string | null;
  gif_url: string | null;
  created_at: string;
  author: {
    prenom: string;
    nom: string;
    email: string;
    avatar_mode: AvatarMode | null;
    avatar_seed: string | null;
    avatar_regen_date: string | null;
  } | null;
}

/**
 * Returns the last 48h of team messages, oldest first (so the UI can just
 * append and scroll to bottom). Includes denormalised author info so we
 * don't have to join on the client.
 */
export async function getRecentTeamMessages(): Promise<TeamMessage[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('team_messages')
    .select(
      `
      id, user_id, contenu, gif_url, created_at,
      author:users!team_messages_user_id_fkey(
        prenom, nom, email, avatar_mode, avatar_seed, avatar_regen_date
      )
    `,
    )
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    // Table team_messages likely missing (migration 00043 not applied yet) -
    // fail soft so /equipe still renders with an empty chat panel.
    logger.warn(
      'queries.team_chat',
      'getRecentTeamMessages failed, returning empty',
      {
        error,
      },
    );
    return [];
  }

  return (data ?? []).map((row) => {
    const author = Array.isArray(row.author)
      ? (row.author[0] ?? null)
      : (row.author ?? null);
    return {
      id: row.id,
      user_id: row.user_id,
      contenu: row.contenu,
      gif_url: row.gif_url,
      created_at: row.created_at,
      author: author
        ? {
            prenom: author.prenom,
            nom: author.nom,
            email: author.email,
            avatar_mode: author.avatar_mode as AvatarMode | null,
            avatar_seed: author.avatar_seed,
            avatar_regen_date: author.avatar_regen_date,
          }
        : null,
    };
  });
}
