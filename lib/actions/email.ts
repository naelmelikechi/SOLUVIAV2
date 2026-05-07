'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { sendEmailForFacture } from '@/lib/email/client';
import { logAudit } from '@/lib/utils/audit';

export async function sendFactureEmailAction(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const result = await sendEmailForFacture(factureId, supabase);

  if (result.success) {
    logAudit('email_sent', 'facture', factureId, undefined, user.id);

    // Revalidate facture detail pages
    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', factureId)
      .single();
    if (facture?.ref) {
      revalidatePath(`/facturation/${facture.ref}`);
    }
    revalidatePath('/facturation');
  }

  return result;
}

export async function sendRelanceEmailAction(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { sendRelanceEmail } = await import('@/lib/email/client');
  const result = await sendRelanceEmail(factureId, supabase);

  if (result.success) {
    logAudit('relance_sent', 'facture', factureId, undefined, user.id);

    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', factureId)
      .single();
    if (facture?.ref) {
      revalidatePath(`/facturation/${facture.ref}`);
    }
  }

  return result;
}
