'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/guards';

const passkeyIdSchema = z.string().uuid('Passkey ID doit être un UUID');

export async function deletePasskey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = passkeyIdSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // RLS contraint deja a `auth.uid() = user_id`, mais on filtre explicitement
  // pour eviter une suppression silencieuse en cas de policy mal configuree.
  const { error } = await supabase
    .from('webauthn_credentials')
    .delete()
    .eq('id', parsed.data)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/parametres-compte');
  return { success: true };
}
