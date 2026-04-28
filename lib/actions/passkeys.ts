'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function deletePasskey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non connecté' };

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
