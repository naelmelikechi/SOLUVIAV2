'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

const AddManualPaymentSchema = z.object({
  factureId: z.string().uuid('factureId doit être un UUID'),
  montant: z
    .number()
    .finite('Montant doit être un nombre fini')
    .positive('Montant doit etre strictement positif')
    .max(10_000_000, 'Montant aberrant'),
  dateReception: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD requise'),
});

export async function addManualPayment(params: {
  factureId: string;
  montant: number;
  dateReception: string;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = AddManualPaymentSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { factureId, montant, dateReception } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Fetch facture to validate status and get montant_ttc + ref
  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select('id, ref, statut, montant_ttc, est_avoir')
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.est_avoir) {
    return {
      success: false,
      error: "Impossible d'enregistrer un paiement sur un avoir",
    };
  }

  if (facture.statut !== 'emise' && facture.statut !== 'en_retard') {
    return { success: false, error: 'La facture doit être émise ou en retard' };
  }

  // Insert paiement
  const { error: insertError } = await supabase.from('paiements').insert({
    facture_id: factureId,
    montant,
    date_reception: dateReception,
    saisie_manuelle: true,
  });

  if (insertError) {
    logger.error('actions.factures', 'addManualPayment insert failed', {
      factureId,
      error: insertError,
    });
    return { success: false, error: insertError.message };
  }

  // Check if sum of payments >= montant_ttc → mark as payée
  const { data: allPaiements } = await supabase
    .from('paiements')
    .select('montant')
    .eq('facture_id', factureId);

  const totalPaye = (allPaiements ?? []).reduce((sum, p) => sum + p.montant, 0);

  if (totalPaye >= facture.montant_ttc) {
    await supabase
      .from('factures')
      .update({ statut: 'payee' })
      .eq('id', factureId);
  }

  // Audit log
  logAudit(
    'paiement_created',
    'paiement',
    factureId,
    {
      montant,
      date_reception: dateReception,
      saisie_manuelle: true,
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${facture.ref}`);

  return { success: true };
}
