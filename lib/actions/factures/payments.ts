'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

export async function addManualPayment(params: {
  factureId: string;
  montant: number;
  dateReception: string;
}): Promise<{ success: boolean; error?: string }> {
  const { factureId, montant, dateReception } = params;

  if (montant <= 0) return { success: false, error: 'Montant invalide' };
  if (!dateReception) return { success: false, error: 'Date requise' };

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

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
  logAudit('paiement_created', 'paiement', factureId, {
    montant,
    date_reception: dateReception,
    saisie_manuelle: true,
  });

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${facture.ref}`);

  return { success: true };
}
