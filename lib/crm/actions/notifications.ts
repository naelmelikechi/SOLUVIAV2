'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { requireCrmUser } from '@/lib/crm/auth/roles';

const uuid = z.string().uuid();

/** Marque une notification comme lue (uniquement si elle appartient à l'utilisateur). */
export async function markRead(id: string): Promise<void> {
  const user = await requireCrmUser();
  if (!uuid.safeParse(id).success) return;
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('notifications')
    .update({ lu: true })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) console.error('[notif] markRead échoué:', error.message); // best-effort : ne casse pas la navigation
  // Le badge cloche vit dans le layout CRM : sa mise à jour nécessite la revalidation du layout.
  revalidatePath('/crm', 'layout');
}

/** Marque toutes les notifications de l'utilisateur comme lues. */
export async function markAllRead(): Promise<void> {
  const user = await requireCrmUser();
  const supabase = await createCrmClient();
  const { error } = await supabase
    .from('notifications')
    .update({ lu: true })
    .eq('user_id', user.id)
    .eq('lu', false);
  if (error) console.error('[notif] markAllRead échoué:', error.message);
  revalidatePath('/crm', 'layout');
}
