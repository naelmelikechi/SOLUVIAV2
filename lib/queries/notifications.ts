import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getNotifications() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Non authentifié');
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, titre, message, lien, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    logger.error('queries.notifications', 'getNotifications failed', { error });
    throw new AppError(
      'NOTIFICATIONS_FETCH_FAILED',
      'Impossible de charger les notifications',
      { cause: error },
    );
  }

  return data;
}

export type NotificationItem = Awaited<
  ReturnType<typeof getNotifications>
>[number];

export async function getUnreadCount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) {
    logger.error('queries.notifications', 'getUnreadCount failed', { error });
    return 0;
  }

  return count ?? 0;
}
