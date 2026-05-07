'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';

const notificationIdSchema = z
  .string()
  .uuid('Notification ID doit etre un UUID');

export async function markNotificationRead(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');

  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');

  return { success: true };
}

export async function deleteNotification(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', parsed.data)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');

  return { success: true };
}
