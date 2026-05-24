'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { createOdooClient } from '@/lib/odoo/client';

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

/**
 * Enregistre un paiement manuel sur une facture.
 *
 * Flow comptable strict :
 * 1. Cree le paiement cote Odoo (account.payment.register) - lettrage auto
 * 2. Si Odoo OK, insert le paiement local avec l'odoo_id retourne
 * 3. Bascule statut a 'payee' si le total des paiements atteint le montant TTC
 *
 * Reserve aux superadmins car ecriture comptable directe dans le livre Odoo.
 * En cas d'erreur Odoo, rien n'est insere localement (pas de drift).
 */
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

  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Fetch facture pour valider statut + recuperer odoo_id pour le push
  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select('id, ref, statut, montant_ttc, est_avoir, odoo_id')
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

  if (!facture.odoo_id) {
    return {
      success: false,
      error:
        "Facture non synchronisee avec Odoo (odoo_id manquant) - impossible d'enregistrer un paiement en compta",
    };
  }

  // Push Odoo en premier : si echec, rien n'est touche cote Soluvia.
  const odoo = createOdooClient();
  let odooPaymentId: string;
  try {
    const result = await odoo.registerPayment({
      invoice_odoo_id: facture.odoo_id,
      amount: montant,
      payment_date: dateReception,
      communication: facture.ref ?? undefined,
    });
    odooPaymentId = result.odoo_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('actions.factures', 'addManualPayment Odoo push failed', {
      factureId,
      error: err,
    });
    return {
      success: false,
      error: `Erreur Odoo : ${msg}`,
    };
  }

  // Insert local seulement apres succes Odoo. odoo_id permet la deduplication
  // si le cron pullPayments ramene plus tard ce meme paiement.
  const { error: insertError } = await supabase.from('paiements').insert({
    facture_id: factureId,
    montant,
    date_reception: dateReception,
    saisie_manuelle: true,
    odoo_id: odooPaymentId,
  });

  if (insertError) {
    logger.error('actions.factures', 'addManualPayment insert failed', {
      factureId,
      odoo_payment_id: odooPaymentId,
      error: insertError,
    });
    // Odoo a deja le paiement (compta safe). L'utilisateur peut relancer le
    // cron Odoo pull pour qu'il soit rapatrie automatiquement.
    return {
      success: false,
      error: `Paiement enregistre dans Odoo mais erreur Soluvia (sera rapatrie au prochain pull cron) : ${insertError.message}`,
    };
  }

  // Statut payee si total >= montant_ttc
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

  logAudit(
    'paiement_created',
    'paiement',
    factureId,
    {
      montant,
      date_reception: dateReception,
      saisie_manuelle: true,
      odoo_payment_id: odooPaymentId,
    },
    user.id,
  );

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${facture.ref}`);

  return { success: true };
}
