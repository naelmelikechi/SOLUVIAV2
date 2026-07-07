'use server';
import { revalidatePath } from 'next/cache';
import { createCrmAdminClient } from '@/lib/crm/supabase/admin';
import { requireCrmAdmin } from '@/lib/crm/auth/roles';
import { sendRecap, type SendRecapResult } from '@/lib/crm/recap';

/** Envoi manuel immédiat (admin). Journalisé trigger='manuel'. */
export async function sendRecapNow(): Promise<SendRecapResult> {
  const profile = await requireCrmAdmin();
  // Récap = lecture org-wide : client service-role (RLS contournée), l'anonymisation
  // des comptes fantômes reste assurée côté fetch (isHiddenEmail).
  const sb = createCrmAdminClient();
  const result = await sendRecap(sb, {
    trigger: 'manuel',
    actorId: profile.id,
  });
  revalidatePath('/crm/recap');
  return result;
}
