'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { sendEmailForFacture } from '@/lib/email/client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------

const SendFactureSchema = z.string().uuid('factureId doit etre un UUID');

const SendFacturesBulkSchema = z
  .array(z.string().uuid('factureId doit etre un UUID'))
  .min(1, 'Aucune facture sélectionnée')
  .max(500, 'Trop de factures sélectionnées');

// ---------------------------------------------------------------------------
// sendFacture - transition brouillon (a_emettre) -> emise (ou avoir).
// ---------------------------------------------------------------------------
// Au passage de statut, le trigger BEFORE UPDATE attribue ref + numero_seq
// (gapless). L'email est ensuite envoye en fire-and-forget. Le push Odoo se
// fera au prochain cron /api/sync/odoo (qui filtre statut IN ('emise','en_retard')
// et odoo_id IS NULL pour les factures, et est_avoir=true pour les avoirs).
export async function sendFacture(
  factureId: string,
): Promise<{ success: boolean; ref?: string; error?: string }> {
  const parsed = SendFactureSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }
  factureId = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Verrou + verification
  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select('id, statut, est_avoir, montant_ht, montant_ttc')
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.statut !== 'a_emettre') {
    return {
      success: false,
      error: 'La facture n’est pas un brouillon (déjà envoyée ?)',
    };
  }

  // Verifie qu'il y a au moins une ligne (eviter d'envoyer un brouillon vide)
  const { count: lignesCount } = await supabase
    .from('facture_lignes')
    .select('id', { count: 'exact', head: true })
    .eq('facture_id', factureId);

  if (!lignesCount || lignesCount === 0) {
    return {
      success: false,
      error:
        'Brouillon sans ligne, impossible d’envoyer. Supprimez-le ou ajoutez une ligne.',
    };
  }

  // Transition de statut. Le trigger assign_facture_ref_on_send attribue le
  // ref + numero_seq dans la meme transaction (gapless preserve).
  const targetStatut = facture.est_avoir ? 'avoir' : 'emise';
  const { data: updated, error: updateError } = await supabase
    .from('factures')
    .update({ statut: targetStatut })
    .eq('id', factureId)
    .eq('statut', 'a_emettre') // optimistic lock
    .select('id, ref, statut')
    .single();

  if (updateError || !updated) {
    logger.error('actions.factures', 'sendFacture update failed', {
      factureId,
      error: updateError,
    });
    return {
      success: false,
      error: updateError?.message ?? 'Échec de la mise à jour',
    };
  }

  logAudit(
    'facture_sent',
    'facture',
    updated.id,
    {
      ref: updated.ref,
      statut: updated.statut,
    },
    user.id,
  );

  // Email fire-and-forget : si Resend echoue, on ne casse pas la facture
  // (facture deja en 'emise' avec ref, l'utilisateur peut renvoyer manuellement).
  sendEmailForFacture(updated.id, supabase).catch((err) => {
    logger.error('actions.factures', 'Email fire-and-forget failed', {
      factureId: updated.id,
      factureRef: updated.ref,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  revalidatePath('/facturation');
  revalidatePath(`/facturation/${updated.ref}`);

  return { success: true, ref: updated.ref ?? undefined };
}

// ---------------------------------------------------------------------------
// sendFacturesBulk - itere sendFacture sur N brouillons. Continue meme si
// une transition echoue, retourne le detail.
// ---------------------------------------------------------------------------
export async function sendFacturesBulk(factureIds: string[]): Promise<{
  success: boolean;
  sent: { id: string; ref: string }[];
  errors: { id: string; error: string }[];
}> {
  const parsed = SendFacturesBulkSchema.safeParse(factureIds);
  if (!parsed.success) {
    return {
      success: false,
      sent: [],
      errors: [
        {
          id: '',
          error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
        },
      ],
    };
  }
  factureIds = parsed.data;

  const sent: { id: string; ref: string }[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const id of factureIds) {
    const r = await sendFacture(id);
    if (r.success && r.ref) sent.push({ id, ref: r.ref });
    else errors.push({ id, error: r.error ?? 'Erreur inconnue' });
  }
  return { success: errors.length === 0, sent, errors };
}
