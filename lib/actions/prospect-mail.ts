'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { canAccessPipeline } from '@/lib/utils/roles';
import { logAudit } from '@/lib/utils/audit';
import { sendCommercialMail } from '@/lib/email/commercial';
import { markRdvMailSent } from '@/lib/actions/rdv';

const SendProspectMailSchema = z.object({
  prospectId: z.string().uuid('Prospect ID doit être un UUID'),
  rdvId: z.string().uuid('RDV ID doit être un UUID').optional(),
  to: z.string().email('Destinataire invalide'),
  cc: z.array(z.string().email('Adresse en copie invalide')).optional(),
  subject: z.string().trim().min(1, 'Objet requis').max(300, 'Objet trop long'),
  bodyHtml: z.string().trim().min(1, 'Corps du mail requis'),
  type: z.enum(['mail_post_rdv', 'mail_manuel']),
});

/**
 * Envoie un mail commercial au prospect (post-RDV ou manuel), le trace dans
 * l'historique des communications de la fiche, et — si rattaché à un RDV —
 * marque ce RDV comme soldé (mail post-RDV envoyé). Feature 3 §6.
 */
export async function sendProspectMail(input: {
  prospectId: string;
  rdvId?: string;
  to: string;
  cc?: string[];
  subject: string;
  bodyHtml: string;
  type: 'mail_post_rdv' | 'mail_manuel';
}): Promise<{ success: boolean; error?: string }> {
  const parsed = SendProspectMailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const data = parsed.data;

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();
  if (!canAccessPipeline(profile?.role, profile?.pipeline_access)) {
    return { success: false, error: 'Accès refusé' };
  }

  const sent = await sendCommercialMail({
    to: data.to,
    cc: data.cc,
    subject: data.subject,
    bodyHtml: data.bodyHtml,
  });
  if (!sent.success) {
    return { success: false, error: sent.error ?? "Échec de l'envoi du mail" };
  }

  const { error: commError } = await supabase
    .from('prospect_communications')
    .insert({
      prospect_id: data.prospectId,
      type: data.type,
      sujet: data.subject,
      destinataire: data.to,
      rdv_id: data.rdvId ?? null,
      user_id: user.id,
    });
  if (commError) return { success: false, error: commError.message };

  if (data.rdvId) {
    await markRdvMailSent(data.rdvId);
  }

  logAudit(
    'prospect_mail_envoye',
    'prospect',
    data.prospectId,
    { type: data.type, rdvId: data.rdvId ?? null },
    user.id,
  );
  revalidatePath('/commercial/prospects/' + data.prospectId);
  return { success: true };
}
