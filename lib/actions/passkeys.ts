'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';

export async function deletePasskey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // RLS contraint deja a `auth.uid() = user_id`, mais on filtre explicitement
  // pour eviter une suppression silencieuse en cas de policy mal configuree.
  const { error } = await supabase
    .from('webauthn_credentials')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/parametres-compte');
  return { success: true };
}
