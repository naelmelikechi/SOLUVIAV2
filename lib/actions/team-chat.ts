'use server';

import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';
import { revalidatePath } from 'next/cache';

// ---------------------------------------------------------------------------
// Team chat - send + delete messages. RLS enforces ownership for delete.
// Messages auto-expire at 48h via /api/cron/chat-cleanup.
// ---------------------------------------------------------------------------

const MAX_CONTENU = 2000;

export async function sendTeamMessage(
  contenu: string | null,
  gifUrl: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const trimmed = contenu?.trim() ?? '';
  const gif = gifUrl?.trim() ?? '';

  if (!trimmed && !gif) {
    return {
      success: false,
      error: 'Le message est vide.',
    };
  }
  if (trimmed.length > MAX_CONTENU) {
    return {
      success: false,
      error: `Message trop long (max ${MAX_CONTENU} caractères).`,
    };
  }

  // Basic sanity check on the gif URL: must be a Giphy media URL we produced.
  if (gif && !/^https:\/\/(media|i)\.giphy\.com\//.test(gif)) {
    return { success: false, error: 'URL GIF non autorisée.' };
  }

  const { error } = await supabase.from('team_messages').insert({
    user_id: authUser.id,
    contenu: trimmed || null,
    gif_url: gif || null,
  });

  if (error) {
    logger.error('team_chat', 'sendTeamMessage failed', { error });
    return { success: false, error: "Impossible d'envoyer le message." };
  }

  return { success: true };
}

export async function deleteTeamMessage(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  // RLS policy team_messages_delete enforces ownership - this will silently
  // delete nothing if the user isn't the author, which is the correct behaviour.
  const { error } = await supabase
    .from('team_messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    logger.error('team_chat', 'deleteTeamMessage failed', { error });
    return { success: false, error: 'Suppression impossible.' };
  }

  revalidatePath('/equipe');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Giphy search - server-side proxy so we never expose the API key client-side.
// Rating forced to "g" (General Audiences) for corp-safe GIFs.
// ---------------------------------------------------------------------------

export interface GiphyResult {
  id: string;
  title: string;
  // small preview URL for the picker grid
  preview: string;
  // full-size URL posted to the chat
  full: string;
  width: number;
  height: number;
}

export async function searchGiphy(
  query: string,
): Promise<{ success: boolean; results?: GiphyResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: 'Non authentifié' };

  const apiKey = env.GIPHY_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        'Recherche GIF non configurée (GIPHY_API_KEY manquante côté serveur).',
    };
  }

  const q = query.trim();
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&limit=12&rating=g&lang=fr`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=12&rating=g`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      logger.error('team_chat', 'giphy search failed', { status: res.status });
      return { success: false, error: 'Giphy indisponible pour le moment.' };
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        title: string;
        images: {
          fixed_width_small?: { url: string; width: string; height: string };
          fixed_width?: { url: string; width: string; height: string };
          original?: { url: string; width: string; height: string };
        };
      }>;
    };

    const results: GiphyResult[] = (json.data ?? [])
      .map((g) => {
        const preview =
          g.images.fixed_width_small?.url ?? g.images.fixed_width?.url ?? '';
        const full = g.images.fixed_width?.url ?? g.images.original?.url ?? '';
        const width = Number(g.images.fixed_width?.width ?? 200);
        const height = Number(g.images.fixed_width?.height ?? 200);
        return {
          id: g.id,
          title: g.title,
          preview,
          full,
          width: Number.isFinite(width) ? width : 200,
          height: Number.isFinite(height) ? height : 200,
        };
      })
      .filter((g) => g.preview && g.full);

    return { success: true, results };
  } catch (error) {
    logger.error('team_chat', 'giphy search error', { error });
    return { success: false, error: 'Giphy indisponible pour le moment.' };
  }
}
