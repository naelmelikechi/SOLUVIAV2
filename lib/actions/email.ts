'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { sendEmailForFacture } from '@/lib/email/client';
import { logAudit } from '@/lib/utils/audit';

const factureIdSchema = z.string().uuid('Facture ID doit être un UUID');

export async function sendFactureEmailAction(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = factureIdSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const result = await sendEmailForFacture(parsed.data, supabase);

  if (result.success) {
    logAudit('email_sent', 'facture', parsed.data, undefined, user.id);

    // Revalidate facture detail pages
    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', parsed.data)
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
  const parsed = factureIdSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { sendRelanceEmail } = await import('@/lib/email/client');
  const result = await sendRelanceEmail(parsed.data, supabase);

  if (result.success) {
    logAudit('relance_sent', 'facture', parsed.data, undefined, user.id);

    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', parsed.data)
      .single();
    if (facture?.ref) {
      revalidatePath(`/facturation/${facture.ref}`);
    }
  }

  return result;
}
