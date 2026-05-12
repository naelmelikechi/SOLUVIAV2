'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';

// ---------------------------------------------------------------------------
// CRUD lignes facture sur les BROUILLONS uniquement (statut 'a_emettre').
// Une fois la facture envoyee (emise/avoir/payee/en_retard), elle est
// immutable au niveau lignes : pour ajuster, il faut emettre un avoir.
//
// Apres chaque mutation, le total facture (montant_ht/tva/ttc) est recalcule.
// ---------------------------------------------------------------------------

const TVA_RATE_DEFAULT = 20;

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas le
// type. Sans ces guards, un client peut poster montantHt=NaN ou
// factureId=garbage et corrompre les donnees ou crasher la query.

const uuidSchema = (label: string) =>
  z.string().uuid(`${label} doit être un UUID`);

// Montants HT : on accepte 0..10M€. Le signe (avoirs) est applique en aval.
const montantHtSchema = z
  .number()
  .finite('Montant doit être un nombre fini')
  .gte(-10_000_000, 'Montant aberrant')
  .lte(10_000_000, 'Montant aberrant');

const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description requise')
  .max(2000, 'Description trop longue');

const AddLigneSchema = z.object({
  factureId: uuidSchema('factureId'),
  contratId: uuidSchema('contratId'),
  description: descriptionSchema,
  montantHt: montantHtSchema,
  moisRelatif: z.number().int().gte(-120).lte(120).optional(),
  quotePart: z.number().finite().gte(0).lte(1).optional(),
  npecSnapshot: z.number().finite().gte(0).lte(10_000_000).optional(),
  tauxCommissionSnapshot: z.number().finite().gte(0).lte(100).optional(),
});

const UpdateLigneSchema = z.object({
  ligneId: uuidSchema('ligneId'),
  description: z.string().trim().min(1).max(2000).optional(),
  montantHt: montantHtSchema.optional(),
});

const RemoveLigneSchema = uuidSchema('ligneId');

async function recomputeFactureTotaux(factureId: string): Promise<void> {
  const supabase = await createClient();
  // lignes + facture en parallele : independants.
  const [lignesRes, factureRes] = await Promise.all([
    supabase
      .from('facture_lignes')
      .select('montant_ht')
      .eq('facture_id', factureId),
    supabase.from('factures').select('taux_tva').eq('id', factureId).single(),
  ]);
  const lignes = lignesRes.data;
  const facture = factureRes.data;

  const totalHt =
    Math.round(
      (lignes ?? []).reduce((s, l) => s + Number(l.montant_ht ?? 0), 0) * 100,
    ) / 100;
  const tauxTva = Number(facture?.taux_tva ?? TVA_RATE_DEFAULT);
  const montantTva = Math.round(totalHt * tauxTva) / 100;
  const montantTtc = Math.round((totalHt + montantTva) * 100) / 100;

  const { error: updateError } = await supabase
    .from('factures')
    .update({
      montant_ht: totalHt,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
    })
    .eq('id', factureId);
  if (updateError) {
    // Etat incoherent : les lignes ont change mais le total facture est
    // stale. L user verra le mauvais montant. On loggue pour detection.
    logger.warn('actions.facture-lignes', 'recompute totaux failed', {
      factureId,
      error: updateError,
    });
  }
}

async function assertBrouillon(factureId: string): Promise<{
  ok: boolean;
  est_avoir?: boolean;
  projet_id?: string;
  ref?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: facture, error } = await supabase
    .from('factures')
    .select('id, statut, est_avoir, projet_id, ref')
    .eq('id', factureId)
    .maybeSingle();
  if (error || !facture) {
    return { ok: false, error: 'Facture introuvable' };
  }
  if (facture.statut !== 'a_emettre') {
    return {
      ok: false,
      error:
        'Seuls les brouillons peuvent être modifiés. Pour ajuster une facture envoyée, créez un avoir.',
    };
  }
  return {
    ok: true,
    est_avoir: facture.est_avoir,
    projet_id: facture.projet_id,
    ref: facture.ref ?? undefined,
  };
}

export interface AddLigneParams {
  factureId: string;
  contratId: string;
  description: string;
  montantHt: number;
  moisRelatif?: number;
  quotePart?: number;
  npecSnapshot?: number;
  tauxCommissionSnapshot?: number;
}

export async function addLigneToBrouillon(
  params: AddLigneParams,
): Promise<{ success: boolean; ligneId?: string; error?: string }> {
  const parsed = AddLigneSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const data = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const check = await assertBrouillon(data.factureId);
  if (!check.ok) return { success: false, error: check.error };

  // Pour les avoirs, le montant doit etre negatif (on inverse au besoin).
  const sign = check.est_avoir ? -1 : 1;
  const montantHtSigned =
    sign === -1 ? -Math.abs(data.montantHt) : Math.abs(data.montantHt);

  // Verifie que le contrat appartient bien au projet de la facture
  const { data: contrat } = await supabase
    .from('contrats')
    .select('id, projet_id, archive')
    .eq('id', data.contratId)
    .maybeSingle();
  if (!contrat) {
    return { success: false, error: 'Contrat introuvable' };
  }
  if (contrat.projet_id !== check.projet_id) {
    return {
      success: false,
      error: 'Le contrat appartient à un autre projet.',
    };
  }

  const { data: ligne, error: insertError } = await supabase
    .from('facture_lignes')
    .insert({
      facture_id: data.factureId,
      contrat_id: data.contratId,
      description: data.description,
      montant_ht: montantHtSigned,
      mois_relatif: data.moisRelatif ?? 0,
      quote_part: data.quotePart ?? 0,
      npec_snapshot: data.npecSnapshot ?? 0,
      taux_commission_snapshot: data.tauxCommissionSnapshot ?? 0,
    })
    .select('id')
    .single();

  if (insertError || !ligne) {
    logger.error('actions.facture-lignes', 'addLigne failed', {
      factureId: data.factureId,
      error: insertError,
    });
    return { success: false, error: insertError?.message ?? 'Erreur ajout' };
  }

  await recomputeFactureTotaux(data.factureId);

  logAudit(
    'facture_ligne_added',
    'facture',
    data.factureId,
    {
      ligneId: ligne.id,
      contratId: data.contratId,
      montant: montantHtSigned,
    },
    user.id,
  );

  revalidatePath('/facturation');
  if (check.ref) revalidatePath(`/facturation/${check.ref}`);

  return { success: true, ligneId: ligne.id };
}

export interface UpdateLigneParams {
  ligneId: string;
  description?: string;
  montantHt?: number;
}

export async function updateLigneInBrouillon(
  params: UpdateLigneParams,
): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateLigneSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  const data = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Charge la ligne pour acceder a la facture et verifier le statut
  const { data: ligne, error: fetchError } = await supabase
    .from('facture_lignes')
    .select('id, facture_id, montant_ht')
    .eq('id', data.ligneId)
    .maybeSingle();
  if (fetchError || !ligne) {
    return { success: false, error: 'Ligne introuvable' };
  }

  const check = await assertBrouillon(ligne.facture_id);
  if (!check.ok) return { success: false, error: check.error };

  const updates: { description?: string; montant_ht?: number } = {};
  if (data.description !== undefined) {
    updates.description = data.description;
  }
  if (data.montantHt !== undefined) {
    const sign = check.est_avoir ? -1 : 1;
    updates.montant_ht =
      sign === -1 ? -Math.abs(data.montantHt) : Math.abs(data.montantHt);
  }
  if (Object.keys(updates).length === 0) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from('facture_lignes')
    .update(updates)
    .eq('id', data.ligneId);

  if (updateError) {
    logger.error('actions.facture-lignes', 'updateLigne failed', {
      ligneId: data.ligneId,
      error: updateError,
    });
    return { success: false, error: updateError.message };
  }

  if (data.montantHt !== undefined) {
    await recomputeFactureTotaux(ligne.facture_id);
  }

  logAudit(
    'facture_ligne_updated',
    'facture',
    ligne.facture_id,
    {
      ligneId: data.ligneId,
      updates,
    },
    user.id,
  );

  revalidatePath('/facturation');
  if (check.ref) revalidatePath(`/facturation/${check.ref}`);

  return { success: true };
}

export async function removeLigneFromBrouillon(
  ligneId: string,
): Promise<{ success: boolean; eventFreed?: boolean; error?: string }> {
  const parsed = RemoveLigneSchema.safeParse(ligneId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }
  ligneId = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  // Charge la ligne pour stats + verification statut
  const { data: ligne, error: fetchError } = await supabase
    .from('facture_lignes')
    .select('id, facture_id, event_type, event_source_id')
    .eq('id', ligneId)
    .maybeSingle();
  if (fetchError || !ligne) {
    return { success: false, error: 'Ligne introuvable' };
  }

  const check = await assertBrouillon(ligne.facture_id);
  if (!check.ok) return { success: false, error: check.error };

  const { error: deleteError } = await supabase
    .from('facture_lignes')
    .delete()
    .eq('id', ligneId);

  if (deleteError) {
    logger.error('actions.facture-lignes', 'removeLigne failed', {
      ligneId,
      error: deleteError,
    });
    return { success: false, error: deleteError.message };
  }

  await recomputeFactureTotaux(ligne.facture_id);

  // Si la ligne avait un event lie (engagement / opco_step), il est
  // automatiquement libere par le DELETE (UNIQUE INDEX uq_facture_lignes_event
  // ne le couvre plus).
  const eventFreed =
    ligne.event_type !== null && ligne.event_source_id !== null;

  logAudit(
    'facture_ligne_removed',
    'facture',
    ligne.facture_id,
    {
      ligneId,
      eventFreed,
    },
    user.id,
  );

  revalidatePath('/facturation');
  if (check.ref) revalidatePath(`/facturation/${check.ref}`);

  return { success: true, eventFreed };
}
