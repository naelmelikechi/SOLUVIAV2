'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendEmailForFacture } from '@/lib/email/client';
import { logAudit } from '@/lib/utils/audit';

export async function sendFactureEmailAction(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const result = await sendEmailForFacture(factureId, supabase);

  if (result.success) {
    logAudit('email_sent', 'facture', factureId);

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non authentifié' };

  const { sendRelanceEmail } = await import('@/lib/email/client');
  const result = await sendRelanceEmail(factureId, supabase);

  if (result.success) {
    logAudit('relance_sent', 'facture', factureId);

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
