'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['nouveau', 'en_cours', 'resolu', 'wontfix']),
  resolutionNotes: z.string().max(2000).nullable(),
});

export async function updateBugReportAction(
  input: z.infer<typeof UpdateSchema>,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Donnees invalides' };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const isResolved =
    parsed.data.status === 'resolu' || parsed.data.status === 'wontfix';

  const { error } = await supabase
    .from('bug_reports')
    .update({
      status: parsed.data.status,
      resolution_notes: parsed.data.resolutionNotes,
      resolved_at: isResolved ? new Date().toISOString() : null,
      resolved_by: isResolved ? user.id : null,
    })
    .eq('id', parsed.data.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/bugs');
  return { success: true };
}
