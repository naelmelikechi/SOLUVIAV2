'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkAuth } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/lib/utils/audit';
import { parseJalons, validateJalons } from '@/lib/echeancier/calc';
import {
  listCandidateFacturesForAjustement as queryCandidateFactures,
  type CandidateFacture,
} from '@/lib/queries/ajustements';
import type { Json } from '@/types/database';

const SCOPE = 'actions.echeanciers';

// ---------------------------------------------------------------------------
// Schemas Zod (validation cote serveur, defense en profondeur)
// ---------------------------------------------------------------------------
// Pourquoi : RLS bloque les acces non autorises mais ne contraint pas les
// types. Sans guards, un client peut poster mois_relatif=NaN, quote_part
// negative, ou un id non-UUID et corrompre les donnees ou crasher la query.

const templateIdSchema = z.string().uuid('Template ID doit être un UUID');

const JalonSchema = z.object({
  mois_relatif: z
    .number()
    .int('mois_relatif doit etre un entier')
    .gte(1, 'mois_relatif doit etre >= 1')
    .lte(120, 'mois_relatif trop grand'),
  quote_part: z
    .number()
    .finite('quote_part doit être un nombre fini')
    .gt(0, 'quote_part doit etre strictement positif')
    .lte(1, 'quote_part doit etre <= 1'),
  label: z.string().trim().max(200).optional(),
});

const JalonsArraySchema = z
  .array(JalonSchema)
  .min(1, 'Au moins un jalon requis')
  .max(60, 'Trop de jalons (max 60)');

const CreateEcheancierTemplateSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(200, 'Nom trop long (max 200)'),
  description: z.string().trim().max(2000).nullable(),
  jalons: JalonsArraySchema,
});

const UpdateEcheancierTemplateSchema = z.object({
  id: templateIdSchema,
  nom: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(200, 'Nom trop long (max 200)'),
  description: z.string().trim().max(2000).nullable(),
  jalons: JalonsArraySchema,
});

// "emitted" requiert factureId : on veut un lien fort avec la facture qui
// materialise l'ajustement (complement ou avoir). Sans ce lien, un clic
// distrait peut fermer un pending sans contrepartie comptable.
// "ignored" n'a pas besoin de factureId (decision explicite "on ne facture pas").
const ResolveAjustementSchema = z
  .object({
    id: z.string().uuid('Ajustement ID doit être un UUID'),
    action: z.enum(['emitted', 'ignored']),
    factureId: z.string().uuid('Facture ID doit être un UUID').optional(),
  })
  .refine((d) => d.action !== 'emitted' || !!d.factureId, {
    message: 'factureId requis quand action=emitted',
    path: ['factureId'],
  });

// ---------------------------------------------------------------------------
// CRUD templates (admin only)
// ---------------------------------------------------------------------------

export async function createEcheancierTemplate(params: {
  nom: string;
  description: string | null;
  jalons: Array<{ mois_relatif: number; quote_part: number; label?: string }>;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = CreateEcheancierTemplateSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(parsed.data.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { data, error } = await auth.supabase
    .from('echeanciers_templates')
    .insert({
      nom: parsed.data.nom,
      description: parsed.data.description?.trim() || null,
      jalons: parsed.data.jalons as unknown as Json,
      is_default: false,
    })
    .select('id')
    .single();
  if (error) {
    logger.error(SCOPE, 'createTemplate failed', { error });
    return { success: false, error: error.message };
  }
  logAudit(
    'echeancier_template_created',
    'echeanciers_templates',
    data.id,
    {
      nom: parsed.data.nom,
    },
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  return { success: true, id: data.id };
}

export async function updateEcheancierTemplate(params: {
  id: string;
  nom: string;
  description: string | null;
  jalons: Array<{ mois_relatif: number; quote_part: number; label?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = UpdateEcheancierTemplateSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const validation = validateJalons(parseJalons(parsed.data.jalons));
  if (!validation.ok) {
    return { success: false, error: validation.errors.join(', ') };
  }

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({
      nom: parsed.data.nom,
      description: parsed.data.description?.trim() || null,
      jalons: parsed.data.jalons as unknown as Json,
    })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    'echeancier_template_updated',
    'echeanciers_templates',
    parsed.data.id,
    undefined,
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  return { success: true };
}

/** Marque un template comme defaut (et retire le flag des autres) */
export async function setEcheancierTemplateDefault(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = templateIdSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  // Retire le flag de tous, puis le pose sur le bon (transaction implicite
  // - si la 1ere update echoue, on annule)
  const { error: clearErr } = await auth.supabase
    .from('echeanciers_templates')
    .update({ is_default: false })
    .eq('is_default', true);
  if (clearErr) return { success: false, error: clearErr.message };

  const { error: setErr } = await auth.supabase
    .from('echeanciers_templates')
    .update({ is_default: true })
    .eq('id', parsed.data);
  if (setErr) return { success: false, error: setErr.message };

  logAudit(
    'echeancier_template_set_default',
    'echeanciers_templates',
    parsed.data,
    undefined,
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  revalidatePath('/projets');
  return { success: true };
}

const ArchiveEcheancierTemplateSchema = z.object({
  id: templateIdSchema,
  archive: z.boolean(),
});

export async function archiveEcheancierTemplate(
  id: string,
  archive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const parsed = ArchiveEcheancierTemplateSchema.safeParse({ id, archive });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('echeanciers_templates')
    .update({ archive: parsed.data.archive })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    parsed.data.archive
      ? 'echeancier_template_archived'
      : 'echeancier_template_restored',
    'echeanciers_templates',
    parsed.data.id,
    undefined,
    auth.user.id,
  );
  revalidatePath('/admin/parametres');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Ajustements pending : resolution manuelle
// ---------------------------------------------------------------------------

/**
 * Wrapper server-action pour lister les factures candidates a partir d'un
 * composant client. Restrict admin only.
 */
export async function listCandidateFacturesForAjustement(
  ajustementId: string,
): Promise<CandidateFacture[]> {
  const auth = await checkAuth();
  if (!auth.ok) return [];
  return queryCandidateFactures(ajustementId);
}

export async function resolveAjustement(params: {
  id: string;
  action: 'emitted' | 'ignored';
  factureId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = ResolveAjustementSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await checkAuth();
  if (!auth.ok) return { success: false, error: auth.error };

  // Validation forte du factureId quand 'emitted' : la facture doit exister,
  // appartenir au meme contrat que l'ajustement, et etre une facture standard
  // OU un avoir coherent avec le signe du delta_ht.
  if (parsed.data.action === 'emitted' && parsed.data.factureId) {
    const { data: aj } = await auth.supabase
      .from('facturation_ajustements_pending')
      .select('contrat_id, delta_ht')
      .eq('id', parsed.data.id)
      .maybeSingle();
    if (!aj) return { success: false, error: 'Ajustement introuvable' };

    const { data: fac } = await auth.supabase
      .from('factures')
      .select('id, est_avoir, montant_ht, statut, facture_lignes(contrat_id)')
      .eq('id', parsed.data.factureId)
      .maybeSingle();
    if (!fac) return { success: false, error: 'Facture introuvable' };

    const linesContratIds = new Set(
      (fac.facture_lignes ?? []).map((l) => l.contrat_id),
    );
    if (!linesContratIds.has(aj.contrat_id)) {
      return {
        success: false,
        error:
          'La facture ne porte aucune ligne sur le contrat de l’ajustement',
      };
    }
    // Coherence signe : ajustement positif (a facturer) -> facture standard ;
    // negatif (avoir) -> est_avoir=true.
    const isAvoirExpected = aj.delta_ht < 0;
    if (isAvoirExpected !== fac.est_avoir) {
      return {
        success: false,
        error: isAvoirExpected
          ? 'Un ajustement négatif doit être lié à un avoir, pas une facture standard'
          : 'Un ajustement positif doit être lié à une facture standard, pas un avoir',
      };
    }
  }

  const { error } = await auth.supabase
    .from('facturation_ajustements_pending')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_action: parsed.data.action,
      resolved_by: auth.user.id,
      resolved_facture_id: parsed.data.factureId ?? null,
    })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: error.message };
  logAudit(
    parsed.data.action === 'emitted'
      ? 'ajustement_emitted'
      : 'ajustement_ignored',
    'facturation_ajustements_pending',
    parsed.data.id,
    undefined,
    auth.user.id,
  );
  revalidatePath('/facturation');
  return { success: true };
}

/** Override JSONB sur un projet (jalons custom) */
