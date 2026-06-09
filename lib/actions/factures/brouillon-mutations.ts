'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import {
  uuidSchema,
  dateStringSchema,
} from '@/lib/actions/factures/brouillons-shared';

const DeleteBrouillonSchema = uuidSchema('factureId');

const UpdateBrouillonInfoSchema = z.object({
  factureId: uuidSchema('factureId'),
  date_emission: dateStringSchema.optional(),
  date_echeance: dateStringSchema.optional(),
  objet: z.string().trim().max(500).nullable().optional(),
  conditions_reglement: z.string().trim().max(500).nullable().optional(),
});

// ---------------------------------------------------------------------------
// deleteBrouillon - supprime un brouillon (statut a_emettre uniquement).
// ---------------------------------------------------------------------------
// Autorise car aucun ref/numero_seq n'a ete attribue : pas d'impact gapless.
// Les facture_lignes sont supprimees par CASCADE. Les echeances liees sont
// detachees (facture_id remis a NULL, validee=false).
export async function deleteBrouillon(
  factureId: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = DeleteBrouillonSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  factureId = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select('id, statut')
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.statut !== 'a_emettre') {
    return {
      success: false,
      error:
        'Seuls les brouillons peuvent être supprimés. Pour annuler une facture émise, créez un avoir.',
    };
  }

  // Detache les echeances + supprime lignes en parallele (independants).
  // CASCADE serait plus propre mais on est explicite ici pour eviter les surprises.
  await Promise.all([
    supabase
      .from('echeances')
      .update({ facture_id: null, validee: false })
      .eq('facture_id', factureId),
    supabase.from('facture_lignes').delete().eq('facture_id', factureId),
  ]);

  const { error: deleteError } = await supabase
    .from('factures')
    .delete()
    .eq('id', factureId)
    .eq('statut', 'a_emettre'); // garde-fou

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  logAudit('brouillon_deleted', 'facture', factureId, {}, user.id);
  revalidatePath('/facturation');
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateBrouillonInfo - edite les champs facture-level d'un brouillon
// ---------------------------------------------------------------------------
// Permet de modifier date_emission, date_echeance, objet, conditions_reglement
// sur un brouillon (statut a_emettre uniquement). Une fois la facture emise,
// ces champs sont immuables (gapless + non-modification legale).
//
// Champs non concernes (volontairement) :
//   - ref / numero_seq : attribues a l'envoi
//   - montants : derives des lignes, edites via ligne-edit
//   - statut / est_avoir : flow controle (sendFacture, createAvoir)
//
// Admin only - une edition tardive de date/conditions est sensible cote
// audit. Si CDP doit pouvoir le faire un jour, basculer en requireAuth.
export async function updateBrouillonInfo(input: {
  factureId: string;
  date_emission?: string;
  date_echeance?: string;
  objet?: string | null;
  conditions_reglement?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateBrouillonInfoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const { factureId, ...rest } = parsed.data;

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: facture, error: fetchError } = await supabase
    .from('factures')
    .select(
      'id, statut, date_emission, date_echeance, objet, conditions_reglement',
    )
    .eq('id', factureId)
    .single();

  if (fetchError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (facture.statut !== 'a_emettre') {
    return {
      success: false,
      error:
        'Seuls les brouillons peuvent être modifiés (facture émise = immuable).',
    };
  }

  // Garde-fou : date_echeance >= date_emission si les deux sont fournies/modifiees.
  const newEmission = rest.date_emission ?? facture.date_emission;
  const newEcheance = rest.date_echeance ?? facture.date_echeance;
  if (newEmission && newEcheance && newEcheance < newEmission) {
    return {
      success: false,
      error:
        "La date d'échéance ne peut pas être antérieure à la date d'émission.",
    };
  }

  // Build update payload : empty strings -> null pour les champs nullable.
  const patch: {
    date_emission?: string;
    date_echeance?: string;
    objet?: string | null;
    conditions_reglement?: string | null;
  } = {};
  if (rest.date_emission !== undefined)
    patch.date_emission = rest.date_emission;
  if (rest.date_echeance !== undefined)
    patch.date_echeance = rest.date_echeance;
  if (rest.objet !== undefined) patch.objet = rest.objet?.trim() || null;
  if (rest.conditions_reglement !== undefined)
    patch.conditions_reglement = rest.conditions_reglement?.trim() || null;

  if (Object.keys(patch).length === 0) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from('factures')
    .update(patch)
    .eq('id', factureId)
    .eq('statut', 'a_emettre');

  if (updateError) {
    logger.error('actions.factures', 'updateBrouillonInfo failed', {
      factureId,
      error: updateError,
    });
    return { success: false, error: updateError.message };
  }

  logAudit('brouillon_info_updated', 'facture', factureId, patch, user.id);
  revalidatePath('/facturation');
  revalidatePath(`/admin/facturation/${factureId}`);
  return { success: true };
}
